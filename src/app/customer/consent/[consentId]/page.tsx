'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ConsentStatusCard } from '@/components/customer/consent-status-card';

interface ConsentData {
  id: string;
  name: string;
  provider: string | null;
  company_name: string | null;
  org_number: string | null;
  status: number;
  etag: string;
  created_at: string;
}

export default function CustomerConsentPage() {
  const params = useParams();
  const consentId = params.consentId as string;

  const [consent, setConsent] = useState<ConsentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConsent = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/consents/${consentId}`);
      if (!res.ok) throw new Error('Consent not found');
      const data = await res.json();
      setConsent(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load consent');
    } finally {
      setLoading(false);
    }
  }, [consentId]);

  useEffect(() => {
    fetchConsent();
  }, [fetchConsent]);

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#141c2b_0%,_#0a0f1a_60%)]" />
      <div className="relative z-10">
        {loading && <p className="text-muted-foreground">Loading...</p>}
        {error && <p className="text-[#f87171]">{error}</p>}
        {consent && (
          <ConsentStatusCard
            consent={consent}
            onRevoked={fetchConsent}
          />
        )}
      </div>
    </div>
  );
}
