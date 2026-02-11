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
  { params }: { params: Promise<{ id: string; resourceType: string; resourceId: string }> },
) {
  const { id: consentId, resourceType, resourceId } = await params;
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
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for fortnox` }, { status: 400 });

    const queryParams: Record<string, string> = {};
    const financialyear = url.searchParams.get('financialyear');
    if (financialyear) queryParams['financialyear'] = financialyear;

    const detailPath = config.resolveDetailPath
      ? config.resolveDetailPath(resourceId, queryParams)
      : config.detailEndpoint.replace('{id}', resourceId);

    const response = await fortnoxClient.get<Record<string, unknown>>(accessToken, detailPath);
    const data = response[config.detailKey];
    if (!data) return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
    const mapped = stripRaw(config.mapper(data as Record<string, unknown>) as Record<string, unknown>);
    return NextResponse.json({ data: mapped });
  }

  if (provider === 'visma') {
    const config = VISMA_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for visma` }, { status: 400 });
    const detailPath = config.detailEndpoint.replace('{id}', resourceId);
    const data = await vismaClient.get<Record<string, unknown>>(accessToken, detailPath);
    const mapped = stripRaw(config.mapper(data) as Record<string, unknown>);
    return NextResponse.json({ data: mapped });
  }

  if (provider === 'briox') {
    const config = BRIOX_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for briox` }, { status: 400 });
    const detailPath = config.detailEndpoint.replace('{id}', resourceId);
    const response = await brioxClient.get<{ data: Record<string, unknown> }>(accessToken, detailPath);
    const mapped = stripRaw(config.mapper(response.data) as Record<string, unknown>);
    return NextResponse.json({ data: mapped });
  }

  if (provider === 'bokio') {
    const config = BOKIO_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not available for bokio` }, { status: 404 });
    const companyId = resolved.providerCompanyId;
    if (!companyId) return NextResponse.json({ error: 'No company ID found for this Bokio consent' }, { status: 400 });
    const detailPath = config.detailEndpoint.replace('{id}', resourceId);
    const data = await bokioClient.getDetail<Record<string, unknown>>(accessToken, companyId, detailPath);
    const mapped = stripRaw(config.mapper(data) as Record<string, unknown>);
    return NextResponse.json({ data: mapped });
  }

  if (provider === 'bjornlunden') {
    const config = BL_RESOURCE_CONFIGS[resourceType as ResourceType];
    if (!config) return NextResponse.json({ error: `Resource ${resourceType} not supported for bjornlunden` }, { status: 400 });
    const userKey = resolved.providerCompanyId;
    if (!userKey) return NextResponse.json({ error: 'No company key found for this Björn Lunden consent' }, { status: 400 });
    const detailPath = config.detailEndpoint.replace('{id}', resourceId);
    const data = await bjornLundenClient.getDetail<Record<string, unknown>>(accessToken, userKey, detailPath);
    const mapped = stripRaw(config.mapper(data) as Record<string, unknown>);
    return NextResponse.json({ data: mapped });
  }

  return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
}
