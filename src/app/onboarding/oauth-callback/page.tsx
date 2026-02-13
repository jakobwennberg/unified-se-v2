'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function OAuthCallbackContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [consentId, setConsentId] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setError(`OAuth denied: ${errorParam}`);
      setStatus('error');
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state');
      setStatus('error');
      return;
    }

    // State format: provider:consentId or provider:consentId:otc
    const separatorIndex = state.indexOf(':');
    if (separatorIndex === -1) {
      setError('Invalid state parameter');
      setStatus('error');
      return;
    }

    const provider = state.substring(0, separatorIndex);
    const rest = state.substring(separatorIndex + 1);
    const secondColon = rest.indexOf(':');
    const cId = secondColon === -1 ? rest : rest.substring(0, secondColon);
    const otc = secondColon === -1 ? undefined : rest.substring(secondColon + 1);
    setConsentId(cId);

    async function exchangeCode() {
      try {
        const res = await fetch(`/api/v1/auth/${provider}/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, consentId: cId, otc }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Token exchange failed (${res.status})`);
        }

        setStatus('success');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
        setStatus('error');
      }
    }

    exchangeCode();
  }, [searchParams]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#141c2b_0%,_#0a0f1a_60%)]" />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border/60 bg-card p-8 shadow-[0_4px_24px_rgba(0,0,0,0.25)] space-y-6">
        {status === 'loading' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground">Connecting your accounting system...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/15 ring-1 ring-destructive/20">
              <svg className="h-6 w-6 text-[#f87171]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="font-serif text-xl tracking-tight">Connection Failed</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            {consentId && (
              <a
                href={`/onboarding/consent/${consentId}`}
                className="inline-block rounded-md border border-input bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                Try Again
              </a>
            )}
          </div>
        )}

        {status === 'success' && consentId && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#2da44e]/15 ring-1 ring-[#2da44e]/20">
              <svg className="h-6 w-6 text-[#3fb950]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="font-serif text-xl tracking-tight">Connected!</h2>
            <p className="text-sm text-muted-foreground">
              Your accounting system has been connected successfully.
              You can safely close this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#141c2b_0%,_#0a0f1a_60%)]" />
        <div className="relative z-10 w-full max-w-md rounded-xl border border-border/60 bg-card p-8 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
          <div className="space-y-4 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}
