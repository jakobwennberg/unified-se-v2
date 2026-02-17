import { inngest } from '../client';
import { resolveConsent } from '@/lib/api/resolve-consent';
import { getSupportedResourceTypes } from '@/lib/sync/fetch-all';
import { syncConsent } from '@/lib/sync/sync-engine';
import type { ResourceType } from '@/lib/types/dto';
import type { ResourceSyncResult } from '@/lib/sync/types';

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

    // Resolve provider to determine resource types
    const provider = await step.run('resolve-provider', async () => {
      const resolved = await resolveConsent(tenantId, consentId);
      return resolved.consent.provider as string;
    });

    const resourceTypes = requestedTypes ?? getSupportedResourceTypes(provider);

    // Run each resource type as an independent step
    const results: ResourceSyncResult[] = [];

    for (const resourceType of resourceTypes) {
      const result = await step.run(`sync-${resourceType}`, async () => {
        const singleResult = await syncConsent({
          consentId,
          tenantId,
          resourceTypes: [resourceType],
        });
        return singleResult.resources[0]!;
      });
      results.push(result);
    }

    const allCompleted = results.every((r) => r.status === 'completed');
    const allFailed = results.every((r) => r.status === 'failed');
    const totalRecordsSynced = results.reduce((sum, r) => sum + r.recordsSynced, 0);

    return {
      consentId,
      provider,
      status: allCompleted ? 'completed' : allFailed ? 'failed' : 'partial',
      resources: results,
      totalRecordsSynced,
    };
  },
);
