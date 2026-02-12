import type { ResourceType } from '@/lib/types/dto';
import type { ProviderName } from '@/lib/providers/types';

// ============================================
// Sync Options & Results
// ============================================

export interface SyncOptions {
  consentId: string;
  tenantId: string;
  /** Specific resource types to sync. If omitted, syncs all supported types for the provider. */
  resourceTypes?: ResourceType[];
}

export interface ResourceSyncResult {
  resourceType: ResourceType;
  status: 'completed' | 'failed' | 'partial';
  recordsSynced: number;
  error?: string;
  durationMs: number;
}

export interface SyncResult {
  consentId: string;
  provider: string;
  syncBatchId: string;
  status: 'completed' | 'partial' | 'failed';
  resources: ResourceSyncResult[];
  totalRecordsSynced: number;
  durationMs: number;
}

// ============================================
// Database Row Types
// ============================================

export interface SyncedResourceRow {
  id?: string;
  consent_id: string;
  tenant_id: string;
  provider: string;
  resource_type: string;
  external_id: string;
  data: Record<string, unknown>;
  document_date?: string | null;
  due_date?: string | null;
  currency_code?: string | null;
  total_amount?: number | null;
  status?: string | null;
  counterparty_name?: string | null;
  account_number?: string | null;
  sync_batch_id: string;
  synced_at?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'completed' | 'failed' | 'partial';

export interface SyncStateRow {
  id?: string;
  consent_id: string;
  resource_type: string;
  status: SyncStatus;
  records_synced?: number;
  started_at?: string | null;
  completed_at?: string | null;
  last_sync_at?: string | null;
  sync_batch_id?: string | null;
  error_message?: string | null;
  last_modified_cursor?: string | null;
}

// ============================================
// Extracted Fields (from DTO to indexed columns)
// ============================================

export interface ExtractedFields {
  external_id: string;
  document_date?: string | null;
  due_date?: string | null;
  currency_code?: string | null;
  total_amount?: number | null;
  status?: string | null;
  counterparty_name?: string | null;
  account_number?: string | null;
}

// ============================================
// Fetch Progress Callback
// ============================================

export type OnProgressFn = (fetched: number, resourceType: ResourceType) => void;

// ============================================
// Provider resource type map helper
// ============================================

export type ProviderResourceConfigs = Partial<Record<ResourceType, unknown>>;
