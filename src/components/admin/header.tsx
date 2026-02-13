'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/components/providers/supabase-provider';
import { Button } from '@/components/ui/button';

export function Header() {
  const router = useRouter();
  const { user } = useUser();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-card/50 px-6 backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg bg-accent/50 px-3 py-1.5">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">
            {user?.email}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-foreground">
          <LogOut className="mr-2 h-3.5 w-3.5" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
