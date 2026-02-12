import { createServiceClient } from '@/lib/supabase/server';
import type { SyncedResourceRow, SyncStateRow, SyncStatus } from './types';

const UPSERT_CHUNK_SIZE = 500;

/**
 * Deduplicate rows by (consent_id, resource_type, external_id), keeping the last occurrence.
 * Postgres ON CONFLICT DO UPDATE cannot affect the same row twice in one statement.
 */
function deduplicateRows(rows: SyncedResourceRow[]): SyncedResourceRow[] {
  const seen = new Map<string, SyncedResourceRow>();
  for (const row of rows) {
    const key = `${row.consent_id}|${row.resource_type}|${row.external_id}`;
    seen.set(key, row);
  }
  return Array.from(seen.values());
}

/**
 * Batch upsert synced resource rows.
 * ON CONFLICT (consent_id, resource_type, external_id) → update data + extracted fields.
 * Returns the number of unique records upserted (after deduplication).
 */
export async function upsertSyncedResources(rows: SyncedResourceRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  const deduplicated = deduplicateRows(rows);
  const supabase = await createServiceClient();

  for (let i = 0; i < deduplicated.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = deduplicated.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabase
      .from('synced_resources')
      .upsert(chunk, {
        onConflict: 'consent_id,resource_type,external_id',
        ignoreDuplicates: false,
      });

    if (error) {
      throw new Error(`Failed to upsert synced_resources chunk ${i / UPSERT_CHUNK_SIZE + 1}: ${error.message}`);
    }
  }

  return deduplicated.length;
}

/**
 * Delete records from previous sync batches (stale data cleanup).
 * Called after a successful full sync to reflect provider-side deletions.
 */
export async function deleteStaleSyncedResources(
  consentId: string,
  resourceType: string,
  currentBatchId: string,
): Promise<number> {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('synced_resources')
    .delete()
    .eq('consent_id', consentId)
    .eq('resource_type', resourceType)
    .neq('sync_batch_id', currentBatchId)
    .select('id');

  if (error) {
    throw new Error(`Failed to delete stale synced_resources: ${error.message}`);
  }

  return data?.length ?? 0;
}

/**
 * Upsert sync state for a consent + resource type combination.
 */
export async function updateSyncState(
  consentId: string,
  resourceType: string,
  update: Partial<Omit<SyncStateRow, 'id' | 'consent_id' | 'resource_type'>>,
): Promise<void> {
  const supabase = await createServiceClient();

  const { error } = await supabase
    .from('sync_state')
    .upsert(
      {
        consent_id: consentId,
        resource_type: resourceType,
        ...update,
      },
      { onConflict: 'consent_id,resource_type' },
    );

  if (error) {
    throw new Error(`Failed to update sync_state: ${error.message}`);
  }
}

/**
 * Read all sync states for a consent.
 */
export async function getSyncState(consentId: string): Promise<SyncStateRow[]> {
  const supabase = await createServiceClient();

  const { data, error } = await supabase
    .from('sync_state')
    .select('*')
    .eq('consent_id', consentId)
    .order('resource_type');

  if (error) {
    throw new Error(`Failed to read sync_state: ${error.message}`);
  }

  return (data ?? []) as SyncStateRow[];
}

/**
 * Read paginated synced resources with optional filters.
 */
export async function getSyncedResources(
  consentId: string,
  resourceType: string,
  options: {
    page?: number;
    pageSize?: number;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    counterpartyName?: string;
    accountNumber?: string;
  } = {},
): Promise<{
  data: Record<string, unknown>[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}> {
  const supabase = await createServiceClient();
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 100;
  const offset = (page - 1) * pageSize;

  // Build query for count
  let countQuery = supabase
    .from('synced_resources')
    .select('id', { count: 'exact', head: true })
    .eq('consent_id', consentId)
    .eq('resource_type', resourceType);

  // Build query for data
  let dataQuery = supabase
    .from('synced_resources')
    .select('data')
    .eq('consent_id', consentId)
    .eq('resource_type', resourceType)
    .order('document_date', { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  // Apply optional filters
  if (options.status) {
    countQuery = countQuery.eq('status', options.status);
    dataQuery = dataQuery.eq('status', options.status);
  }
  if (options.dateFrom) {
    countQuery = countQuery.gte('document_date', options.dateFrom);
    dataQuery = dataQuery.gte('document_date', options.dateFrom);
  }
  if (options.dateTo) {
    countQuery = countQuery.lte('document_date', options.dateTo);
    dataQuery = dataQuery.lte('document_date', options.dateTo);
  }
  if (options.counterpartyName) {
    countQuery = countQuery.ilike('counterparty_name', `%${options.counterpartyName}%`);
    dataQuery = dataQuery.ilike('counterparty_name', `%${options.counterpartyName}%`);
  }
  if (options.accountNumber) {
    countQuery = countQuery.eq('account_number', options.accountNumber);
    dataQuery = dataQuery.eq('account_number', options.accountNumber);
  }

  const [countResult, dataResult] = await Promise.all([countQuery, dataQuery]);

  if (countResult.error) throw new Error(`Count query failed: ${countResult.error.message}`);
  if (dataResult.error) throw new Error(`Data query failed: ${dataResult.error.message}`);

  const totalCount = countResult.count ?? 0;
  const data = (dataResult.data ?? []).map((row) => row.data as Record<string, unknown>);

  return {
    data,
    page,
    pageSize,
    totalCount,
    hasMore: offset + pageSize < totalCount,
  };
}
