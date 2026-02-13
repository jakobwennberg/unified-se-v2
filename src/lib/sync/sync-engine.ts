import { resolveConsent } from '@/lib/api/resolve-consent';
import type { ResourceType } from '@/lib/types/dto';
import type { SyncOptions, SyncResult, ResourceSyncResult, SyncedResourceRow, OnBatchFn } from './types';
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
  const log = (msg: string) => console.log(`[sync ${consentId.slice(0, 8)}] ${msg}`);

  // 1. Resolve consent → get tokens, provider info
  let resolved = await resolveConsent(tenantId, consentId);
  const provider = resolved.consent.provider as string;

  // 2. Determine resource types
  const resourceTypes = requestedTypes ?? getSupportedResourceTypes(provider);
  log(`Starting sync for ${provider} — ${resourceTypes.length} resource types`);

  // 3. Generate batch ID
  const syncBatchId = crypto.randomUUID();

  // 4. Sync each resource type sequentially
  const results: ResourceSyncResult[] = [];
  let totalRecordsSynced = 0;

  for (const resourceType of resourceTypes) {
    const resourceStart = Date.now();
    let resourceResult: ResourceSyncResult;
    log(`[${resourceType}] Starting fetch`);

    try {
      // Mark as syncing
      await updateSyncState(consentId, resourceType, {
        status: 'syncing',
        started_at: new Date().toISOString(),
        sync_batch_id: syncBatchId,
        error_message: null,
      });

      // Build an onBatch callback for incremental upserts during hydration
      let incrementalCount = 0;
      const onBatch: OnBatchFn = async (batch) => {
        const rows: SyncedResourceRow[] = batch.map((dto) => {
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
        const count = await upsertSyncedResources(rows);
        incrementalCount += count;
      };

      // Fetch all data with full hydration — onBatch upserts each batch as it arrives
      let dtos: Record<string, unknown>[];
      try {
        dtos = await fetchAllForProvider(provider, resourceType, resolved, undefined, onBatch);
      } catch (fetchErr: unknown) {
        // On 401, try re-resolving consent for fresh token
        const e = fetchErr as { statusCode?: number; status?: number };
        if (e.statusCode === 401 || e.status === 401) {
          log(`[${resourceType}] Got 401, re-resolving consent`);
          resolved = await resolveConsent(tenantId, consentId);
          dtos = await fetchAllForProvider(provider, resourceType, resolved, undefined, onBatch);
        } else {
          throw fetchErr;
        }
      }

      log(`[${resourceType}] Fetched ${dtos.length} records in ${((Date.now() - resourceStart) / 1000).toFixed(1)}s`);

      // If onBatch wasn't called (non-hydrated types), do a bulk upsert
      let uniqueCount: number;
      if (incrementalCount > 0) {
        uniqueCount = incrementalCount;
      } else {
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
        uniqueCount = await upsertSyncedResources(rows);
      }

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
      log(`[${resourceType}] Completed — ${uniqueCount} records in ${((Date.now() - resourceStart) / 1000).toFixed(1)}s`);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log(`[${resourceType}] Failed after ${((Date.now() - resourceStart) / 1000).toFixed(1)}s — ${errorMessage}`);

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

  log(`Sync finished — ${overallStatus}, ${totalRecordsSynced} total records in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

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
