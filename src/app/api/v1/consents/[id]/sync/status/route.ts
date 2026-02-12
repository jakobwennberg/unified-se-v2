import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/api/auth-middleware';
import { getSyncState } from '@/lib/sync/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: consentId } = await params;
  const auth = await authenticateRequest(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const states = await getSyncState(consentId);

    const syncing = states.filter((s) => s.status === 'syncing').length;
    const completed = states.filter((s) => s.status === 'completed').length;
    const failed = states.filter((s) => s.status === 'failed').length;

    const overallStatus = syncing > 0
      ? 'syncing'
      : failed > 0 && completed > 0
        ? 'partial'
        : failed > 0
          ? 'failed'
          : completed > 0
            ? 'completed'
            : 'idle';

    return NextResponse.json({
      consentId,
      overallStatus,
      summary: { syncing, completed, failed, total: states.length },
      resources: states,
    });
  } catch (err: unknown) {
    const e = err as { message?: string };
    return NextResponse.json({ error: e.message ?? 'Failed to get sync status' }, { status: 500 });
  }
}
