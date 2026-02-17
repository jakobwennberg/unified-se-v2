import { inngest } from '../client';
import type { GetStepTools } from 'inngest';
import { resolveConsent } from '@/lib/api/resolve-consent';
import { getSupportedResourceTypes, fetchAllForProvider } from '@/lib/sync/fetch-all';
import { FortnoxClient } from '@/lib/providers/fortnox/client';
import { FORTNOX_RESOURCE_CONFIGS } from '@/lib/providers/fortnox/config';
import { extractFields } from '@/lib/sync/extract-fields';
import {
  upsertSyncedResources,
  deleteStaleSyncedResources,
  updateSyncState,
} from '@/lib/sync/db';
import { ResourceType } from '@/lib/types/dto';
import type { SyncedResourceRow } from '@/lib/sync/types';

/**
 * Max raw items to hydrate per Inngest step.
 * At Fortnox rate limit (4 req/s) with batches of 5:
 * 200 items = 40 batches × ~1.5s ≈ 60s — safely under 300s.
 */
const HYDRATION_CHUNK = 200;

/** Resource types that require slow detail-call hydration for Fortnox */
function fortnoxNeedsChunkedHydration(provider: string, resourceType: string): boolean {
  if (provider !== 'fortnox') return false;
  const config = FORTNOX_RESOURCE_CONFIGS[resourceType as ResourceType];
  return !!(config?.supportsEntryHydration) || resourceType === ResourceType.AccountingAccounts;
}

export const syncConsentFunction = inngest.createFunction(
  {
    id: 'sync-consent',
    retries: 1,
  },
  { event: 'arcim/sync.requested' },
  async ({ event, step }) => {
    const { consentId, tenantId, resourceTypes: requestedTypes } = event.data as {
      consentId: string;
      tenantId: string;
      resourceTypes?: ResourceType[];
    };

    const provider = await step.run('resolve-provider', async () => {
      const resolved = await resolveConsent(tenantId, consentId);
      return resolved.consent.provider as string;
    });

    const resourceTypes = requestedTypes ?? getSupportedResourceTypes(provider);
    const syncBatchId = crypto.randomUUID();
    const results: { resourceType: string; status: string; recordsSynced: number }[] = [];

    for (const resourceType of resourceTypes) {
      try {
        await step.run(`mark-syncing-${resourceType}`, () =>
          updateSyncState(consentId, resourceType, {
            status: 'syncing',
            started_at: new Date().toISOString(),
            sync_batch_id: syncBatchId,
            error_message: null,
          }),
        );

        let recordCount: number;

        if (fortnoxNeedsChunkedHydration(provider, resourceType)) {
          // === Chunked hydration path for heavy Fortnox resource types ===
          recordCount = await syncFortnoxChunked(
            step, consentId, tenantId, provider, resourceType, syncBatchId,
          );
        } else {
          // === Standard path: single step for list + hydration ===
          recordCount = await step.run(`fetch-${resourceType}`, async () => {
            const resolved = await resolveConsent(tenantId, consentId);
            let count = 0;
            const onBatch = async (batch: Record<string, unknown>[]) => {
              const rows = buildRows(batch, consentId, tenantId, provider, resourceType, syncBatchId);
              count += await upsertSyncedResources(rows);
            };

            const dtos = await fetchAllForProvider(
              provider, resourceType as ResourceType, resolved, undefined, onBatch,
            );

            if (count === 0 && dtos.length > 0) {
              const rows = buildRows(dtos, consentId, tenantId, provider, resourceType, syncBatchId);
              count = await upsertSyncedResources(rows);
            }
            return count;
          });
        }

        await step.run(`finalize-${resourceType}`, async () => {
          await deleteStaleSyncedResources(consentId, resourceType, syncBatchId);
          await updateSyncState(consentId, resourceType, {
            status: 'completed',
            records_synced: recordCount,
            completed_at: new Date().toISOString(),
            last_sync_at: new Date().toISOString(),
            sync_batch_id: syncBatchId,
            error_message: null,
          });
        });

        results.push({ resourceType, status: 'completed', recordsSynced: recordCount });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        await step.run(`mark-failed-${resourceType}`, () =>
          updateSyncState(consentId, resourceType, {
            status: 'failed',
            completed_at: new Date().toISOString(),
            error_message: errorMessage,
            sync_batch_id: syncBatchId,
          }),
        );
        results.push({ resourceType, status: 'failed', recordsSynced: 0 });
      }
    }

    const allCompleted = results.every((r) => r.status === 'completed');
    const allFailed = results.every((r) => r.status === 'failed');

    return {
      consentId,
      provider,
      syncBatchId,
      status: allCompleted ? 'completed' : allFailed ? 'failed' : 'partial',
      resources: results,
      totalRecordsSynced: results.reduce((sum, r) => sum + r.recordsSynced, 0),
    };
  },
);

// ============================================
// Chunked Fortnox hydration
// ============================================

type StepTools = GetStepTools<typeof inngest>;

async function syncFortnoxChunked(
  step: StepTools,
  consentId: string,
  tenantId: string,
  provider: string,
  resourceType: string,
  syncBatchId: string,
): Promise<number> {
  const config = FORTNOX_RESOURCE_CONFIGS[resourceType as ResourceType]!;
  const fortnoxClient = new FortnoxClient();

  // Step: fetch paginated list (no hydration) — fast
  const rawItems: Record<string, unknown>[] = await step.run(`list-${resourceType}`, async () => {
    const resolved = await resolveConsent(tenantId, consentId);

    if (config.singleton) {
      const response = await fortnoxClient.get<Record<string, unknown>>(
        resolved.accessToken, config.listEndpoint,
      );
      return [response[config.listKey] as Record<string, unknown>];
    }

    return fortnoxClient.getPaginated<Record<string, unknown>>(
      resolved.accessToken, config.listEndpoint, config.listKey,
    );
  });

  if (rawItems.length === 0) return 0;

  // Split into chunks and hydrate each in its own step
  const totalChunks = Math.ceil(rawItems.length / HYDRATION_CHUNK);
  let totalUpserted = 0;

  for (let i = 0; i < totalChunks; i++) {
    const chunk = rawItems.slice(i * HYDRATION_CHUNK, (i + 1) * HYDRATION_CHUNK);

    const upsertedCount: number = await step.run(
      `hydrate-${resourceType}-${i + 1}of${totalChunks}`,
      async () => {
        const resolved = await resolveConsent(tenantId, consentId);
        const client = new FortnoxClient();
        const BATCH_SIZE = 5;
        const hydrated: Record<string, unknown>[] = [];

        for (let j = 0; j < chunk.length; j += BATCH_SIZE) {
          const batch = chunk.slice(j, j + BATCH_SIZE);
          const batchResults = await Promise.all(
            batch.map((item) => hydrateFortnoxItem(client, resolved.accessToken, resourceType, config, item)),
          );
          hydrated.push(...batchResults);
        }

        const mapped = hydrated.map(config.mapper).map((m) => {
          const { _raw, ...rest } = m as Record<string, unknown>;
          return rest;
        });

        const rows = buildRows(mapped, consentId, tenantId, provider, resourceType, syncBatchId);
        return upsertSyncedResources(rows);
      },
    );

    totalUpserted += upsertedCount;
  }

  return totalUpserted;
}

async function hydrateFortnoxItem(
  client: FortnoxClient,
  accessToken: string,
  resourceType: string,
  config: NonNullable<(typeof FORTNOX_RESOURCE_CONFIGS)[ResourceType]>,
  item: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    if (config.supportsEntryHydration) {
      // Journal hydration: fetch VoucherRows
      const series = String(item['VoucherSeries'] ?? '');
      const number = String(item['VoucherNumber'] ?? '');
      const year = String(item['Year'] ?? '');
      const fyParam = year ? `?financialyear=${year}` : '';
      const detailPath = `/vouchers/${series}/${number}${fyParam}`;
      const detailResponse = await client.get<Record<string, unknown>>(accessToken, detailPath);
      const detail = detailResponse[config.detailKey] as Record<string, unknown> | undefined;
      if (detail?.['VoucherRows']) {
        return { ...item, VoucherRows: detail['VoucherRows'] };
      }
    } else if (resourceType === ResourceType.AccountingAccounts) {
      // Account hydration: fetch balance details
      const accountNumber = item['Number'] ?? item['number'];
      if (accountNumber != null) {
        const detailResponse = await client.get<Record<string, unknown>>(
          accessToken, `/accounts/${accountNumber}`,
        );
        const detail = detailResponse['Account'] as Record<string, unknown> | undefined;
        if (detail) return { ...item, ...detail };
      }
    }
  } catch {
    // Graceful degradation — return item without hydrated data
  }
  return item;
}

// ============================================
// Helpers
// ============================================

function buildRows(
  dtos: Record<string, unknown>[],
  consentId: string,
  tenantId: string,
  provider: string,
  resourceType: string,
  syncBatchId: string,
): SyncedResourceRow[] {
  return dtos.map((dto) => {
    const fields = extractFields(resourceType as ResourceType, dto);
    return {
      consent_id: consentId,
      tenant_id: tenantId,
      provider,
      resource_type: resourceType,
      external_id: fields.external_id,
      data: dto,
      document_date: fields.document_date,
      due_date: fields.due_date,
      currency_code: fields.currency_code,
      total_amount: fields.total_amount,
      status: fields.status,
      counterparty_name: fields.counterparty_name,
      account_number: fields.account_number,
      sync_batch_id: syncBatchId,
      synced_at: new Date().toISOString(),
    };
  });
}
