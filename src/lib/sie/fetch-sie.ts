import { createClient } from '@supabase/supabase-js';
import type { SIEParseResult } from '@/lib/providers/manual-sie/parser';

/**
 * Load parsed SIE data for a manual-sie consent from the sie_uploads table.
 * Returns the most recent upload's parsed_data, or null if none exists.
 */
export async function loadManualSieParsed(consentId: string): Promise<SIEParseResult | null> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: uploads } = await supabase
    .from('sie_uploads')
    .select('parsed_data')
    .eq('consent_id', consentId)
    .order('uploaded_at', { ascending: false })
    .limit(1);

  if (!uploads || uploads.length === 0) {
    return null;
  }

  return uploads[0]!.parsed_data as unknown as SIEParseResult;
}
