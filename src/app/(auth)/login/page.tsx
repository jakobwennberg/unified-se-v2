'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <div className="space-y-8" style={{ animation: 'fade-in 0.4s ease-out' }}>
      {/* Brand header */}
      <div className="text-center">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/20">
          <span className="font-serif text-2xl text-primary">A</span>
        </div>
        <h1 className="font-serif text-2xl tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to your Arcim account
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
              className="flex h-10 w-full rounded-md border border-input bg-[#0d1321] px-3 py-2 text-sm text-foreground transition-colors duration-200 placeholder:text-muted-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-primary/50"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-[0_1px_2px_rgba(201,168,76,0.3)] transition-all duration-200 hover:bg-[#d4b455] hover:shadow-[0_2px_8px_rgba(201,168,76,0.25)] disabled:opacity-40"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>

      <p className="text-center text-[13px] text-muted-foreground">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="text-primary transition-colors hover:text-[#d4b455]">
          Sign up
        </Link>
      </p>
    </div>
  );
}
