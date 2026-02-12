import { resolveConsent } from '@/lib/api/resolve-consent';
import type { ResourceType } from '@/lib/types/dto';
import type { SyncOptions, SyncResult, ResourceSyncResult, SyncedResourceRow } from './types';
import { fetchAllForProvider, getSupportedResourceTypes } from './fetch-all';
import { extractFields } from './extract-fields';
import { upsertSyncedResources, deleteStaleSyncedResources, updateSyncState } from './db';

/**
 * Sync all (or specified) resource types for a consent.
 * Fetches full hydrated data from the provider, stores it in synced_resources,
 * and tracks progress in sync_state.
 */
export async function syncConsent(options: SyncOptions): Promise<SyncResult> {
  const { consentId, tenantId, resourceTypes: requestedTypes } = options;
  const startTime = Date.now();

  // 1. Resolve consent → get tokens, provider info
  let resolved = await resolveConsent(tenantId, consentId);
  const provider = resolved.consent.provider as string;

  // 2. Determine resource types
  const resourceTypes = requestedTypes ?? getSupportedResourceTypes(provider);

  // 3. Generate batch ID
  const syncBatchId = crypto.randomUUID();

  // 4. Sync each resource type sequentially
  const results: ResourceSyncResult[] = [];
  let totalRecordsSynced = 0;

  for (const resourceType of resourceTypes) {
    const resourceStart = Date.now();
    let resourceResult: ResourceSyncResult;

    try {
      // Mark as syncing
      await updateSyncState(consentId, resourceType, {
        status: 'syncing',
        started_at: new Date().toISOString(),
        sync_batch_id: syncBatchId,
        error_message: null,
      });

      // Fetch all data with full hydration
      let dtos: Record<string, unknown>[];
      try {
        dtos = await fetchAllForProvider(provider, resourceType, resolved);
      } catch (fetchErr: unknown) {
        // On 401, try re-resolving consent for fresh token
        const e = fetchErr as { statusCode?: number; status?: number };
        if (e.statusCode === 401 || e.status === 401) {
          resolved = await resolveConsent(tenantId, consentId);
          dtos = await fetchAllForProvider(provider, resourceType, resolved);
        } else {
          throw fetchErr;
        }
      }

      // Build rows with extracted fields
      const rows: SyncedResourceRow[] = dtos.map((dto) => {
        const fields = extractFields(resourceType, dto);
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

      // Upsert in batches (returns deduplicated count)
      const uniqueCount = await upsertSyncedResources(rows);

      // Clean up stale records from previous batches
      await deleteStaleSyncedResources(consentId, resourceType, syncBatchId);

      // Update sync state to completed
      await updateSyncState(consentId, resourceType, {
        status: 'completed',
        records_synced: uniqueCount,
        completed_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        sync_batch_id: syncBatchId,
        error_message: null,
      });

      resourceResult = {
        resourceType,
        status: 'completed',
        recordsSynced: uniqueCount,
        durationMs: Date.now() - resourceStart,
      };
      totalRecordsSynced += uniqueCount;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      await updateSyncState(consentId, resourceType, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: errorMessage,
        sync_batch_id: syncBatchId,
      }).catch(() => {
        // Don't fail the overall sync if state update fails
      });

      resourceResult = {
        resourceType,
        status: 'failed',
        recordsSynced: 0,
        error: errorMessage,
        durationMs: Date.now() - resourceStart,
      };
    }

    results.push(resourceResult);
  }

  // 5. Determine overall status
  const allCompleted = results.every((r) => r.status === 'completed');
  const allFailed = results.every((r) => r.status === 'failed');
  const overallStatus = allCompleted ? 'completed' : allFailed ? 'failed' : 'partial';

  return {
    consentId,
    provider,
    syncBatchId,
    status: overallStatus,
    resources: results,
    totalRecordsSynced,
    durationMs: Date.now() - startTime,
  };
}
