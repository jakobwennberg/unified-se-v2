import { serve } from 'inngest/next';
import { inngest } from '@/inngest/client';
import { syncConsentFunction } from '@/inngest/functions/sync-consent';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [syncConsentFunction],
});
