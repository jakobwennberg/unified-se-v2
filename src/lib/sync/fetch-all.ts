import { createClient } from '@supabase/supabase-js';
import { ResourceType } from '@/lib/types/dto';
import type { ResolvedConsent } from '@/lib/api/resolve-consent';
import { FORTNOX_RESOURCE_CONFIGS } from '@/lib/providers/fortnox/config';
import { VISMA_RESOURCE_CONFIGS } from '@/lib/providers/visma/config';
import { BRIOX_RESOURCE_CONFIGS } from '@/lib/providers/briox/config';
import { BOKIO_RESOURCE_CONFIGS } from '@/lib/providers/bokio/config';
import { BL_RESOURCE_CONFIGS } from '@/lib/providers/bjornlunden/config';
import { FortnoxClient } from '@/lib/providers/fortnox/client';
import { VismaClient } from '@/lib/providers/visma/client';
import { BrioxClient } from '@/lib/providers/briox/client';
import { BokioClient } from '@/lib/providers/bokio/client';
import { BjornLundenClient } from '@/lib/providers/bjornlunden/client';
import { mapSieAccounts, mapSieJournals, mapSieCompanyInfo } from '@/lib/providers/manual-sie/mapper';
import type { SIEParseResult } from '@/lib/providers/manual-sie/parser';
import type { OnProgressFn } from './types';

const fortnoxClient = new FortnoxClient();
const vismaClient = new VismaClient();
const brioxClient = new BrioxClient();
const bokioClient = new BokioClient();
const bjornLundenClient = new BjornLundenClient();

function stripRaw(obj: Record<string, unknown>): Record<string, unknown> {
  const { _raw, ...rest } = obj;
  return rest;
}

/**
 * Get the supported resource types for a given provider.
 */
export function getSupportedResourceTypes(provider: string): ResourceType[] {
  switch (provider) {
    case 'fortnox':
      return Object.keys(FORTNOX_RESOURCE_CONFIGS) as ResourceType[];
    case 'visma':
      return Object.keys(VISMA_RESOURCE_CONFIGS) as ResourceType[];
    case 'briox':
      return Object.keys(BRIOX_RESOURCE_CONFIGS) as ResourceType[];
    case 'bokio':
      return Object.keys(BOKIO_RESOURCE_CONFIGS) as ResourceType[];
    case 'bjornlunden':
      return Object.keys(BL_RESOURCE_CONFIGS) as ResourceType[];
    case 'manual-sie':
      return [ResourceType.AccountingAccounts, ResourceType.Journals, ResourceType.CompanyInformation];
    default:
      return [];
  }
}

/**
 * Fetch all records for a provider + resource type with full hydration.
 * Returns an array of mapped canonical DTOs (with _raw stripped).
 */
export async function fetchAllForProvider(
  provider: string,
  resourceType: ResourceType,
  resolved: ResolvedConsent,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const { accessToken } = resolved;

  switch (provider) {
    case 'fortnox':
      return fetchFortnox(resourceType, accessToken, onProgress);
    case 'visma':
      return fetchVisma(resourceType, accessToken, onProgress);
    case 'briox':
      return fetchBriox(resourceType, accessToken, onProgress);
    case 'bokio':
      return fetchBokio(resourceType, accessToken, resolved.providerCompanyId!, onProgress);
    case 'bjornlunden':
      return fetchBjornLunden(resourceType, accessToken, resolved.providerCompanyId!, onProgress);
    case 'manual-sie':
      return fetchManualSie(resourceType, resolved.consent.id as string);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ============================================
// Fortnox
// ============================================

async function fetchFortnox(
  resourceType: ResourceType,
  accessToken: string,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const config = FORTNOX_RESOURCE_CONFIGS[resourceType];
  if (!config) throw new Error(`Resource ${resourceType} not supported for fortnox`);

  // Singleton (e.g. CompanyInformation)
  if (config.singleton) {
    const response = await fortnoxClient.get<Record<string, unknown>>(accessToken, config.listEndpoint);
    const data = response[config.listKey];
    return [stripRaw(config.mapper(data as Record<string, unknown>) as Record<string, unknown>)];
  }

  // Paginated fetch — all pages
  const rawItems = await fortnoxClient.getPaginated<Record<string, unknown>>(
    accessToken,
    config.listEndpoint,
    config.listKey,
  );
  onProgress?.(rawItems.length, resourceType);

  // Hydrate journals (VoucherRows) via detail fetches — batched to respect rate limits
  if (config.supportsEntryHydration) {
    const BATCH_SIZE = 5;
    const hydrated: Record<string, unknown>[] = [];
    for (let i = 0; i < rawItems.length; i += BATCH_SIZE) {
      const batch = rawItems.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const series = String(item['VoucherSeries'] ?? '');
            const number = String(item['VoucherNumber'] ?? '');
            const year = String(item['Year'] ?? '');
            const fyParam = year ? `?financialyear=${year}` : '';
            const detailPath = `/vouchers/${series}/${number}${fyParam}`;
            const detailResponse = await fortnoxClient.get<Record<string, unknown>>(accessToken, detailPath);
            const detail = detailResponse[config.detailKey] as Record<string, unknown> | undefined;
            if (detail?.['VoucherRows']) {
              return { ...item, VoucherRows: detail['VoucherRows'] };
            }
          } catch {
            // Graceful degradation
          }
          return item;
        }),
      );
      hydrated.push(...batchResults);
    }
    return hydrated.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
  }

  // Hydrate account balances via detail endpoint (/accounts/{Number})
  if (resourceType === ResourceType.AccountingAccounts && rawItems.length > 0) {
    const BATCH_SIZE = 5;
    const hydrated: Record<string, unknown>[] = [];
    for (let i = 0; i < rawItems.length; i += BATCH_SIZE) {
      const batch = rawItems.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const accountNumber = item['Number'] ?? item['number'];
            if (accountNumber == null) return item;
            const detailResponse = await fortnoxClient.get<Record<string, unknown>>(
              accessToken,
              `/accounts/${accountNumber}`,
            );
            const detail = detailResponse['Account'] as Record<string, unknown> | undefined;
            if (detail) {
              return { ...item, ...detail };
            }
          } catch {
            // Graceful degradation
          }
          return item;
        }),
      );
      hydrated.push(...batchResults);
    }
    return hydrated.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
  }

  return rawItems.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
}

// ============================================
// Visma
// ============================================

async function fetchVisma(
  resourceType: ResourceType,
  accessToken: string,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const config = VISMA_RESOURCE_CONFIGS[resourceType];
  if (!config) throw new Error(`Resource ${resourceType} not supported for visma`);

  // Singleton
  if (config.singleton) {
    const data = await vismaClient.get<Record<string, unknown>>(accessToken, config.listEndpoint);
    return [stripRaw(config.mapper(data) as Record<string, unknown>)];
  }

  // Paginated fetch — all pages
  const rawItems = await vismaClient.getPaginated<Record<string, unknown>>(
    accessToken,
    config.listEndpoint,
  );
  onProgress?.(rawItems.length, resourceType);

  let mapped = rawItems.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));

  // Enrich accounts with balance data
  if (resourceType === ResourceType.AccountingAccounts && mapped.length > 0) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const balances = await vismaClient.getPaginated<Record<string, unknown>>(
        accessToken,
        `/accountbalances/${today}`,
      );
      const balanceMap = new Map<string, number>();
      for (const b of balances) {
        const accNum = b['AccountNumber'] != null ? String(b['AccountNumber']) : undefined;
        const balance = b['Balance'] as number | undefined;
        if (accNum != null && balance != null) {
          balanceMap.set(accNum, balance);
        }
      }
      mapped = mapped.map((account) => {
        const accNum = account['accountNumber'] as string | undefined;
        if (accNum && balanceMap.has(accNum)) {
          return { ...account, balanceCarriedForward: balanceMap.get(accNum) };
        }
        return account;
      });
    } catch {
      // Graceful degradation
    }
  }

  return mapped;
}

// ============================================
// Briox
// ============================================

async function fetchBriox(
  resourceType: ResourceType,
  accessToken: string,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const config = BRIOX_RESOURCE_CONFIGS[resourceType];
  if (!config) throw new Error(`Resource ${resourceType} not supported for briox`);

  // Singleton
  if (config.singleton) {
    const response = await brioxClient.get<{ data: Record<string, unknown> }>(accessToken, config.listEndpoint);
    return [stripRaw(config.mapper(response.data) as Record<string, unknown>)];
  }

  let listEndpoint = config.listEndpoint;
  let fiscalYear: string | undefined;
  if (config.yearScoped) {
    fiscalYear = await brioxClient.getCurrentFinancialYear(accessToken);
    listEndpoint = `${config.listEndpoint}/${fiscalYear}`;
  }

  // Paginated fetch — all pages
  const rawItems = await brioxClient.getPaginated<Record<string, unknown>>(
    accessToken,
    listEndpoint,
    config.listKey,
  );
  onProgress?.(rawItems.length, resourceType);

  // Hydrate journal entries in batches of 5
  if (config.supportsEntryHydration && fiscalYear) {
    const BATCH_SIZE = 5;
    const hydrated: Record<string, unknown>[] = [];
    for (let i = 0; i < rawItems.length; i += BATCH_SIZE) {
      const batch = rawItems.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          try {
            const series = String(item['series'] ?? '');
            const id = String(item['id'] ?? '');
            if (!series || !id) return item;
            const detailPath = `/journal/${fiscalYear}/${series}/${id}`;
            const detailResponse = await brioxClient.get<{ data: Record<string, unknown> }>(accessToken, detailPath);
            const detail = detailResponse.data?.['journal'] as Record<string, unknown> | undefined;
            if (detail?.['journal_rows']) {
              return { ...item, journal_rows: detail['journal_rows'] };
            }
          } catch {
            // Graceful degradation
          }
          return item;
        }),
      );
      hydrated.push(...batchResults);
    }
    return hydrated.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
  }

  return rawItems.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
}

// ============================================
// Bokio
// ============================================

async function fetchBokio(
  resourceType: ResourceType,
  accessToken: string,
  companyId: string,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const config = BOKIO_RESOURCE_CONFIGS[resourceType];
  if (!config) throw new Error(`Resource ${resourceType} not supported for bokio`);

  // Singleton (CompanyInformation)
  if (config.singleton) {
    const data = await bokioClient.getCompany<Record<string, unknown>>(accessToken, companyId);
    const raw = data ?? { id: companyId };
    return [stripRaw(config.mapper(raw) as Record<string, unknown>)];
  }

  // Non-paginated endpoints
  if (config.paginated === false) {
    let items = await bokioClient.getAll<Record<string, unknown>>(accessToken, companyId, config.listEndpoint);
    onProgress?.(items.length, resourceType);

    // Always hydrate account balances (unlike route handler which requires opt-in)
    if (resourceType === ResourceType.AccountingAccounts && items.length > 0) {
      const BATCH_SIZE = 5;
      const hydrated: Record<string, unknown>[] = [];
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            try {
              const accountNum = item['account'] ?? item['accountNumber'] ?? item['number'];
              if (accountNum == null) return item;
              const detail = await bokioClient.getDetail<Record<string, unknown>>(
                accessToken, companyId, `/chart-of-accounts/${accountNum}`,
              );
              return detail ?? item;
            } catch {
              return item;
            }
          }),
        );
        hydrated.push(...batchResults);
      }
      items = hydrated;
    }

    return items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
  }

  // Paginated endpoints — fetch all pages
  const allItems: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await bokioClient.getPage<Record<string, unknown>>(accessToken, companyId, config.listEndpoint, {
      page,
      pageSize: 50,
    });
    allItems.push(...result.items);
    totalPages = result.totalPages;
    page++;
  } while (page <= totalPages);

  onProgress?.(allItems.length, resourceType);
  return allItems.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
}

// ============================================
// Björn Lunden
// ============================================

async function fetchBjornLunden(
  resourceType: ResourceType,
  accessToken: string,
  userKey: string,
  onProgress?: OnProgressFn,
): Promise<Record<string, unknown>[]> {
  const config = BL_RESOURCE_CONFIGS[resourceType];
  if (!config) throw new Error(`Resource ${resourceType} not supported for bjornlunden`);

  // Singleton (CompanyInformation)
  if (config.singleton) {
    const data = await bjornLundenClient.getDetail<Record<string, unknown>>(accessToken, userKey, config.listEndpoint);
    return [stripRaw(config.mapper(data) as Record<string, unknown>)];
  }

  // Non-paginated endpoints
  if (config.paginated === false) {
    const items = await bjornLundenClient.getAll<Record<string, unknown>>(accessToken, userKey, config.listEndpoint);
    onProgress?.(items.length, resourceType);
    return items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
  }

  // Paginated endpoints — fetch all pages
  const allItems: Record<string, unknown>[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await bjornLundenClient.getPage<Record<string, unknown>>(accessToken, userKey, config.listEndpoint, {
      page,
      pageSize: 50,
    });
    allItems.push(...result.items);
    totalPages = result.totalPages;
    page++;
  } while (page <= totalPages);

  onProgress?.(allItems.length, resourceType);
  return allItems.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
}

// ============================================
// Manual SIE
// ============================================

async function fetchManualSie(
  resourceType: ResourceType,
  consentId: string,
): Promise<Record<string, unknown>[]> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: uploads } = await supabase
    .from('sie_uploads')
    .select('parsed_data')
    .eq('consent_id', consentId)
    .order('uploaded_at', { ascending: true });

  if (!uploads || uploads.length === 0) return [];

  const allResults = uploads.map((u) => u.parsed_data as unknown as SIEParseResult);

  if (resourceType === ResourceType.CompanyInformation) {
    const latest = allResults[allResults.length - 1]!;
    const mapped = mapSieCompanyInfo(latest);
    return [mapped as unknown as Record<string, unknown>];
  }

  if (resourceType === ResourceType.AccountingAccounts) {
    const accountMap = new Map<string, ReturnType<typeof mapSieAccounts>[number]>();
    for (const result of allResults) {
      for (const acc of mapSieAccounts(result)) {
        accountMap.set(acc.accountNumber, acc);
      }
    }
    return Array.from(accountMap.values()) as unknown as Record<string, unknown>[];
  }

  if (resourceType === ResourceType.Journals) {
    const allJournals = allResults.flatMap((r) => mapSieJournals(r));
    return allJournals as unknown as Record<string, unknown>[];
  }

  return [];
}
