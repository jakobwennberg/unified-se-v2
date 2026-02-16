'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileCheck, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/consents', label: 'Consents', icon: FileCheck },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border/60 bg-[#0d1321]">
      {/* Brand */}
      <div className="flex h-16 items-center border-b border-border/60 px-6">
        <Link href="/dashboard" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Accounting API
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/60">
          Platform
        </p>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <item.icon className={cn(
                'h-[18px] w-[18px] transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-foreground',
              )} />
              {item.label}
              {isActive && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border/60 px-6 py-4">
        <p className="text-[11px] text-muted-foreground/50">
          Arcim v1.0
        </p>
      </div>
    </aside>
  );
}
