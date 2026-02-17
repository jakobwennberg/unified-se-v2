'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmEmail = searchParams.get('confirm');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.replace(`/signup?confirm=${encodeURIComponent(email)}`);
    }
  };

  if (confirmEmail) {
    return (
      <div className="space-y-8" style={{ animation: 'fade-in 0.4s ease-out' }}>
        <div className="text-center">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
            <svg className="h-6 w-6 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h1 className="font-serif text-2xl tracking-tight">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{confirmEmail}</span>. Click the link to activate your account.
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
          <p className="text-center text-[13px] text-muted-foreground">
            Didn&apos;t receive the email? Check your spam folder or{' '}
            <Link
              href="/signup"
              className="text-primary transition-colors hover:text-[#d4b455]"
            >
              try again
            </Link>
          </p>
        </div>

        <p className="text-center text-[13px] text-muted-foreground">
          Already confirmed?{' '}
          <Link href="/login" className="text-primary transition-colors hover:text-[#d4b455]">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8" style={{ animation: 'fade-in 0.4s ease-out' }}>
      {/* Brand header */}
      <div className="text-center">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
          <span className="font-serif text-2xl text-primary">A</span>
        </div>
        <h1 className="font-serif text-2xl tracking-tight">Create account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get started for free
        </p>
      </div>

      {/* Form card */}
      <div className="rounded-xl border border-border/60 bg-card p-6 shadow-[0_4px_24px_rgba(0,0,0,0.25)]">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-[#f87171]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-[13px] font-medium text-muted-foreground">
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-[#0d1321] px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary/50"
              placeholder="Your name"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-[13px] font-medium text-muted-foreground">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-[#0d1321] px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary/50"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-[13px] font-medium text-muted-foreground">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="flex h-10 w-full rounded-md border border-input bg-[#0d1321] px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary/50"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(201,168,76,0.3)] transition-all duration-200 hover:bg-[#d4b455] hover:shadow-[0_2px_8px_rgba(201,168,76,0.25)] disabled:opacity-40"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>

      <p className="text-center text-[13px] text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="text-primary transition-colors hover:text-[#d4b455]">
          Sign in
        </Link>
      </p>
    </div>
  );
}
