import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { resolveConsent, type ResolvedConsent } from '@/lib/api/resolve-consent';
import { ResourceType } from '@/lib/types/dto';
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

const fortnoxClient = new FortnoxClient();
const vismaClient = new VismaClient();
const brioxClient = new BrioxClient();
const bokioClient = new BokioClient();
const bjornLundenClient = new BjornLundenClient();

const VALID_RESOURCE_TYPES = new Set(Object.values(ResourceType));

function stripRaw(obj: Record<string, unknown>): Record<string, unknown> {
  const { _raw, ...rest } = obj;
  return rest;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; resourceType: string }> },
) {
  const { id: consentId, resourceType } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!VALID_RESOURCE_TYPES.has(resourceType as ResourceType)) {
    return NextResponse.json({ error: `Unknown resource type: ${resourceType}` }, { status: 400 });
  }

  let resolved: ResolvedConsent;
  try {
    resolved = await resolveConsent(auth.tenantId, consentId);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json({ error: e.message ?? 'Failed to resolve consent' }, { status: e.status ?? 500 });
  }

  const { consent, accessToken } = resolved;
  const provider = consent.provider as string;
  const url = new URL(request.url);

  if (provider === 'fortnox') {
    const config = FORTNOX_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) {
      return NextResponse.json({ error: `Resource ${resourceType} not supported for fortnox` }, { status: 400 });
    }

    if (config.singleton) {
      const response = await fortnoxClient.get<Record<string, unknown>>(accessToken, config.listEndpoint);
      const data = response[config.listKey];
      const mapped = stripRaw(config.mapper(data as Record<string, unknown>) as Record<string, unknown>);
      return NextResponse.json({ data: mapped });
    }

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 100;
    const includeEntries = url.searchParams.get('includeEntries') !== 'false';
    const financialyear = url.searchParams.get('financialyear');

    let listEndpoint = config.listEndpoint;
    if (financialyear) {
      const sep = listEndpoint.includes('?') ? '&' : '?';
      listEndpoint = `${listEndpoint}${sep}financialyear=${financialyear}`;
    }

    const result = await fortnoxClient.getPage<Record<string, unknown>>(
      accessToken, listEndpoint, config.listKey,
      { page, pageSize, lastModified: url.searchParams.get('lastModified') ?? undefined },
    );

    if (includeEntries && config.supportsEntryHydration) {
      const hydrated = await Promise.all(
        result.items.map(async (item) => {
          try {
            const series = String(item['VoucherSeries'] ?? '');
            const number = String(item['VoucherNumber'] ?? '');
            const year = String(item['Year'] ?? financialyear ?? '');
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
      const mapped = hydrated.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
      return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
    }

    const mapped = result.items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
    return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
  }

  if (provider === 'visma') {
    const config = VISMA_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for visma` }, { status: 400 });

    if (config.singleton) {
      const data = await vismaClient.get<Record<string, unknown>>(accessToken, config.listEndpoint);
      const mapped = stripRaw(config.mapper(data) as Record<string, unknown>);
      return NextResponse.json({ data: mapped });
    }

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 100;

    const result = await vismaClient.getPage<Record<string, unknown>>(accessToken, config.listEndpoint, {
      page, pageSize,
      modifiedSince: url.searchParams.get('modifiedSince') ?? undefined,
      modifiedField: config.modifiedField,
    });

    const mapped = result.items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
    return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
  }

  if (provider === 'briox') {
    const config = BRIOX_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for briox` }, { status: 400 });

    if (config.singleton) {
      const response = await brioxClient.get<{ data: Record<string, unknown> }>(accessToken, config.listEndpoint);
      const mapped = stripRaw(config.mapper(response.data) as Record<string, unknown>);
      return NextResponse.json({ data: mapped });
    }

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 100;
    const includeEntries = url.searchParams.get('includeEntries') !== 'false';

    let listEndpoint = config.listEndpoint;
    let fiscalYear: string | undefined;
    if (config.yearScoped) {
      fiscalYear = url.searchParams.get('fiscalYear') ?? await brioxClient.getCurrentFinancialYear(accessToken);
      listEndpoint = `${config.listEndpoint}/${fiscalYear}`;
    }

    const result = await brioxClient.getPage<Record<string, unknown>>(accessToken, listEndpoint, config.listKey, {
      page, pageSize,
      fromModifiedDate: config.supportsModifiedFilter ? (url.searchParams.get('lastModified') ?? undefined) : undefined,
    });

    if (includeEntries && config.supportsEntryHydration && fiscalYear) {
      // Hydrate in batches of 5 to stay within Briox rate limits (10 req/s)
      const BATCH_SIZE = 5;
      const hydrated: Record<string, unknown>[] = [];
      for (let i = 0; i < result.items.length; i += BATCH_SIZE) {
        const batch = result.items.slice(i, i + BATCH_SIZE);
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
              // Graceful degradation — return item without rows
            }
            return item;
          }),
        );
        hydrated.push(...batchResults);
      }
      const mapped = hydrated.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
      return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
    }

    const mapped = result.items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
    return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
  }

  if (provider === 'bokio') {
    const config = BOKIO_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) {
      return NextResponse.json({ data: [], page: 1, pageSize: 0, totalCount: 0, totalPages: 0, hasMore: false });
    }

    const companyId = resolved.providerCompanyId;
    if (!companyId) return NextResponse.json({ error: 'No company ID found for this Bokio consent' }, { status: 400 });

    if (config.singleton) {
      const data = await bokioClient.getCompany<Record<string, unknown>>(accessToken, companyId);
      const raw = data ?? { id: companyId };
      const mapped = stripRaw(config.mapper(raw) as Record<string, unknown>);
      return NextResponse.json({ data: mapped });
    }

    if (config.paginated === false) {
      const items = await bokioClient.getAll<Record<string, unknown>>(accessToken, companyId, config.listEndpoint);
      const mapped = items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
      return NextResponse.json({ data: mapped, page: 1, pageSize: items.length, totalCount: items.length, totalPages: 1, hasMore: false });
    }

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 50;

    const result = await bokioClient.getPage<Record<string, unknown>>(accessToken, companyId, config.listEndpoint, {
      page, pageSize, query: url.searchParams.get('query') ?? undefined,
    });

    const mapped = result.items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
    return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
  }

  if (provider === 'bjornlunden') {
    const config = BL_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for bjornlunden` }, { status: 400 });

    const userKey = resolved.providerCompanyId;
    if (!userKey) return NextResponse.json({ error: 'No company key found for this Björn Lunden consent' }, { status: 400 });

    if (config.singleton) {
      const data = await bjornLundenClient.getDetail<Record<string, unknown>>(accessToken, userKey, config.listEndpoint);
      const mapped = stripRaw(config.mapper(data) as Record<string, unknown>);
      return NextResponse.json({ data: mapped });
    }

    if (config.paginated === false) {
      const items = await bjornLundenClient.getAll<Record<string, unknown>>(accessToken, userKey, config.listEndpoint);
      const mapped = items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
      return NextResponse.json({ data: mapped, page: 1, pageSize: items.length, totalCount: items.length, totalPages: 1, hasMore: false });
    }

    const page = url.searchParams.get('page') ? Number(url.searchParams.get('page')) : 1;
    const pageSize = url.searchParams.get('pageSize') ? Number(url.searchParams.get('pageSize')) : 50;

    const result = await bjornLundenClient.getPage<Record<string, unknown>>(accessToken, userKey, config.listEndpoint, { page, pageSize });

    const mapped = result.items.map(config.mapper).map(m => stripRaw(m as Record<string, unknown>));
    return NextResponse.json({ data: mapped, page: result.page, pageSize, totalCount: result.totalCount, totalPages: result.totalPages, hasMore: result.page < result.totalPages });
  }

  return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
}
