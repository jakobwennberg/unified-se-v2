import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { ResourceType } from '@/lib/types/dto';
import { getSyncState } from '@/lib/sync/db';
import { inngest } from '@/inngest/client';

const VALID_RESOURCE_TYPES = new Set(Object.values(ResourceType));

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check for already-running sync
  const existingStates = await getSyncState(consentId);
  const alreadySyncing = existingStates.some((s) => s.status === 'syncing');
  if (alreadySyncing) {
    return NextResponse.json(
      { error: 'Sync already in progress for this consent', states: existingStates },
      { status: 409 },
    );
  }

  // Parse optional resource types from body
  let resourceTypes: ResourceType[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.resourceTypes && Array.isArray(body.resourceTypes)) {
      const validTypes = body.resourceTypes.filter((rt: string) => VALID_RESOURCE_TYPES.has(rt as ResourceType));
      if (validTypes.length > 0) {
        resourceTypes = validTypes as ResourceType[];
      }
    }
  } catch {
    // No body or invalid JSON — sync all types
  }

  try {
    const { ids } = await inngest.send({
      name: 'arcim/sync.requested',
      data: {
        consentId,
        tenantId: auth.tenantId,
        resourceTypes,
      },
    });

    return NextResponse.json(
      { message: 'Sync started', eventId: ids[0], consentId },
      { status: 202 },
    );
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return NextResponse.json(
      { error: e.message ?? 'Failed to start sync' },
      { status: e.status ?? 500 },
    );
  }
}
