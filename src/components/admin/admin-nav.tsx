'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, CreditCard, Flag, IdCard, MessagesSquare, ReceiptText, ScrollText, Settings, Star, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/profiles', label: 'Profiles', icon: IdCard },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/transactions', label: 'Transactions', icon: ReceiptText },
  { href: '/admin/community', label: 'Community', icon: MessagesSquare },
  { href: '/admin/reviews', label: 'Reviews', icon: Star },
  { href: '/admin/reports', label: 'Reports', icon: Flag },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/system', label: 'System', icon: Activity },
];

export function AdminNav({ openReports }: { openReports: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:overflow-visible lg:p-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn('flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            {href === '/admin/reports' && openReports > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 text-xs font-medium text-accent-foreground">{openReports}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
