import { redirect } from 'next/navigation';
import { createServerClient, createServiceClient } from '@/lib/supabase/server';
import { SettingsContent } from '@/components/admin/settings-content';

export default async function SettingsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const db = await createServiceClient();
  const { data: tenant } = await db
    .from('tenants')
    .select('*')
    .eq('auth_user_id', user.id)
    .single();

  if (!tenant) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Setting up your account...</p>
      </div>
    );
  }

  return (
    <SettingsContent
      tenant={{
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        plan: tenant.plan,
        rate_limit_per_minute: tenant.rate_limit_per_minute,
        rate_limit_per_day: tenant.rate_limit_per_day as number,
        max_consents: tenant.max_consents,
      }}
    />
  );
}
