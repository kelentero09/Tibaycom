'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Archive, ArchiveRestore, FileText, Mail, MailOpen, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { Button } from './ui/button';
import { ConfirmDialog } from './ui/dialog';
import { Badge } from './ui/misc';

export type InboxItem = { id: string; name: string; contact: string; message: string; status: 'new' | 'read' | 'archived'; emailSent: boolean; createdAt: number };

/** Turns whatever the visitor typed as "contact" into a tappable call or email link when it clearly is one. */
function contactLink(contact: string): { href: string; kind: 'phone' | 'email' } | null {
  const trimmed = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { href: `mailto:${trimmed}`, kind: 'email' };
  const digits = trimmed.replace(/[^+\d]/g, '');
  if (/^(\+63|0)\d{9,11}$/.test(digits)) return { href: `tel:${digits}`, kind: 'phone' };
  return null;
}

const timeAgo = (timestamp: number, now: number) => {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)} d ago`;
  return new Date(timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function InboxList({ items, now }: { items: InboxItem[]; now: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<InboxItem | null>(null);

  async function setStatus(item: InboxItem, status: InboxItem['status']) {
    setBusy(item.id);
    try {
      await api(`/api/inbox/${item.id}`, { method: 'PATCH', body: { status } });
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(toDelete.id);
    try {
      await api(`/api/inbox/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Request deleted');
      setToDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="grid gap-3">
        {items.map((item, index) => {
          const link = contactLink(item.contact);
          const isNew = item.status === 'new';
          return (
            <li key={item.id} className={`stagger grid gap-3 rounded-xl border bg-background p-4 shadow-card sm:p-5 ${isNew ? 'border-l-4 border-l-accent' : ''}`} style={{ '--i': index } as React.CSSProperties}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="grid gap-0.5">
                  <p className="flex items-center gap-2 font-semibold">
                    {item.name}
                    {isNew && <Badge variant="accent">New</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(item.createdAt, now)}
                    {!item.emailSent && ' · email notice was not delivered'}
                  </p>
                </div>
                {link ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={link.href}>
                      {link.kind === 'phone' ? <Phone aria-hidden /> : <Mail aria-hidden />} {item.contact}
                    </a>
                  </Button>
                ) : (
                  <span className="rounded-md bg-muted px-2.5 py-1.5 text-sm">{item.contact}</span>
                )}
              </div>
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">{item.message}</p>
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button asChild size="sm">
                  <Link href="/quotations/new" onClick={() => isNew && void setStatus(item, 'read')}>
                    <FileText aria-hidden /> Create quotation
                  </Link>
                </Button>
                {item.status !== 'archived' && (
                  <Button variant="ghost" size="sm" disabled={busy === item.id} onClick={() => void setStatus(item, isNew ? 'read' : 'new')}>
                    {isNew ? <MailOpen aria-hidden /> : <Mail aria-hidden />} {isNew ? 'Mark as read' : 'Mark as new'}
                  </Button>
                )}
                <Button variant="ghost" size="sm" disabled={busy === item.id} onClick={() => void setStatus(item, item.status === 'archived' ? 'read' : 'archived')}>
                  {item.status === 'archived' ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {item.status === 'archived' ? 'Move to inbox' : 'Archive'}
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => setToDelete(item)}>
                  <Trash2 aria-hidden /> Delete
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)} title="Delete this request?" description={`The request from ${toDelete?.name ?? 'this client'} and their contact details will be permanently removed.`} confirmLabel="Delete request" loading={busy === toDelete?.id} onConfirm={remove} />
    </>
  );
}
