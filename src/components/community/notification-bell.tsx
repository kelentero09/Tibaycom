'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Bell, Heart, Loader2, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { timeAgo } from '@/lib/community';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../ui/dropdown';

type Item = {
  id: string;
  type: 'heart' | 'comment';
  postId: string | null;
  read: boolean;
  createdAt: string;
  actor: { username: string; businessName: string; avatarUrl: string | null } | null;
};

/** Unread count is rendered by the server on page load; opening the menu loads the list and marks everything read. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<Item[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function onOpenChange(open: boolean) {
    if (!open) return;
    setFailed(false);
    try {
      const data = await api<{ items: Item[]; unread: number }>('/api/notifications');
      setItems(data.items);
      if (data.unread > 0) {
        setUnread(0);
        await api('/api/notifications/read', { method: 'POST' });
      }
    } catch {
      setFailed(true);
    }
  }

  return (
    <DropdownMenu onOpenChange={(open) => void onOpenChange(open)}>
      <DropdownMenuTrigger className="relative flex size-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-accent px-1 text-center text-[0.65rem] font-semibold leading-4 text-accent-foreground" aria-hidden>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        {failed ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Could not load notifications. Try again.</p>
        ) : items === null ? (
          <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet. Hearts and comments on your posts appear here.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <DropdownMenuItem key={item.id} asChild className="items-start py-2">
                <Link href={item.postId ? `/community/${item.postId}` : '/community'}>
                  {item.type === 'heart' ? <Heart aria-hidden className="mt-0.5 shrink-0 fill-current !text-destructive" /> : <MessageCircle aria-hidden className="mt-0.5 shrink-0" />}
                  <span className="grid gap-0.5">
                    <span className={item.read ? 'text-muted-foreground' : 'font-medium'}>
                      {item.actor?.businessName ?? 'Someone'} {item.type === 'heart' ? 'hearted your post' : 'commented on your post'}
                    </span>
                    <span className="text-xs text-muted-foreground">{timeAgo(new Date(item.createdAt))}</span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
