'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Check, CheckCheck, FileText, Mail, MailOpen, MessagesSquare, Phone, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { ConfirmDialog } from './ui/dialog';
import { Input, Textarea } from './ui/form';

export type InboxMessage = { id: string; sender: 'pro' | 'client'; body: string; createdAt: number };
export type InboxItem = {
  id: string;
  name: string;
  contact: string;
  message: string;
  status: 'new' | 'read' | 'archived';
  emailSent: boolean;
  createdAt: number;
  messages: InboxMessage[];
  /** The client gave an email address, so replies are emailed to them. */
  clientGetsEmail: boolean;
  /** When the client last opened their private conversation page (null = never). */
  clientReadAt: number | null;
};

/** Turns whatever the visitor typed as "contact" into a tappable call or email link when it clearly is one. */
function contactLink(contact: string): { href: string; kind: 'phone' | 'email' } | null {
  const trimmed = contact.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { href: `mailto:${trimmed}`, kind: 'email' };
  const digits = trimmed.replace(/[^+\d]/g, '');
  if (/^(\+63|0)\d{9,11}$/.test(digits)) return { href: `tel:${digits}`, kind: 'phone' };
  return null;
}

/** Short time for the list: "3m", "5h", "2d", then a date. */
function shortTime(timestamp: number, now: number) {
  const minutes = Math.max(0, Math.round((now - timestamp) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 1440)}d`;
  return new Date(timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

const fullTime = (timestamp: number) => new Date(timestamp).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const dayLabel = (timestamp: number) => new Date(timestamp).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const AVATAR_COLORS = ['bg-sky-100 text-sky-800', 'bg-amber-100 text-amber-800', 'bg-emerald-100 text-emerald-800', 'bg-rose-100 text-rose-800', 'bg-violet-100 text-violet-800', 'bg-teal-100 text-teal-800'];
function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  const color = AVATAR_COLORS[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', color, size === 'lg' ? 'size-11 text-base' : 'size-10 text-sm')}>{initials}</span>;
}

type Thread = { item: InboxItem; last: { body: string; mine: boolean; at: number }; unread: boolean };

export function InboxList({ items, now, archived, initialId }: { items: InboxItem[]; now: number; archived: boolean; initialId: string | null }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialId && items.some((i) => i.id === initialId) ? initialId : null);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [openedLocally, setOpenedLocally] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<InboxItem | null>(null);

  const threads: Thread[] = useMemo(
    () =>
      items.map((item) => {
        const lastMessage = item.messages.at(-1);
        const last = lastMessage ? { body: lastMessage.body, mine: lastMessage.sender === 'pro', at: lastMessage.createdAt } : { body: item.message, mine: false, at: item.createdAt };
        return { item, last, unread: item.status === 'new' && !openedLocally.has(item.id) };
      }),
    [items, openedLocally],
  );
  const unreadCount = threads.filter((t) => t.unread).length;
  const visible = threads.filter((t) => (!unreadOnly || t.unread) && (!query.trim() || `${t.item.name} ${t.item.contact} ${t.item.message} ${t.item.messages.map((m) => m.body).join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())));
  const selected = threads.find((t) => t.item.id === selectedId) ?? null;

  async function setStatus(item: InboxItem, status: InboxItem['status'], quiet = false) {
    try {
      await api(`/api/inbox/${item.id}`, { method: 'PATCH', body: { status } });
      if (!quiet) router.refresh();
    } catch (err) {
      if (!quiet) toast.error(errorMessage(err));
    }
  }

  function open(thread: Thread) {
    setSelectedId(thread.item.id);
    window.history.replaceState(null, '', `/inbox?${archived ? 'view=archived&' : ''}c=${thread.item.id}`);
    // Opening a new request marks it read, like an email.
    if (thread.unread) {
      setOpenedLocally((s) => new Set(s).add(thread.item.id));
      void setStatus(thread.item, 'read', true);
    }
  }

  function close() {
    setSelectedId(null);
    window.history.replaceState(null, '', archived ? '/inbox?view=archived' : '/inbox');
  }

  async function act(item: InboxItem, status: InboxItem['status'], message: string) {
    setBusy(true);
    await setStatus(item, status);
    setBusy(false);
    if (status === 'new') setOpenedLocally((s) => new Set([...s].filter((id) => id !== item.id)));
    if (status === 'archived' || archived) close();
    toast.success(message);
  }

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/api/inbox/${toDelete.id}`, { method: 'DELETE' });
      toast.success('Request deleted');
      setToDelete(null);
      close();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid h-[calc(100dvh-13rem)] min-h-[30rem] overflow-hidden rounded-2xl border bg-background shadow-card md:grid-cols-[22rem_1fr]">
        {/* Conversation list */}
        <section aria-label="Conversations" className={cn('flex min-h-0 flex-col border-r', selected && 'max-md:hidden')}>
          <div className="grid gap-3 border-b p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input type="search" aria-label="Search requests" placeholder="Search name or message" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
            </div>
            {!archived && (
              <div className="flex gap-1.5 text-sm">
                {[
                  { value: false, label: 'All' },
                  { value: true, label: `Unread${unreadCount ? ` (${unreadCount})` : ''}` },
                ].map((f) => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => setUnreadOnly(f.value)}
                    aria-pressed={unreadOnly === f.value}
                    className={cn('rounded-full px-3 py-1 font-medium', unreadOnly === f.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{query ? 'No requests match your search.' : unreadOnly ? 'You are all caught up.' : 'No requests here.'}</li>}
            {visible.map((t) => {
              const active = t.item.id === selectedId;
              return (
                <li key={t.item.id}>
                  <button
                    type="button"
                    onClick={() => open(t)}
                    aria-current={active ? 'true' : undefined}
                    className={cn('flex w-full items-center gap-3 border-b px-3 py-3 text-left transition-colors', active ? 'bg-accent-soft' : 'hover:bg-muted/60')}
                  >
                    <Avatar name={t.item.name} />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate', t.unread ? 'font-bold text-foreground' : 'font-medium')}>{t.item.name}</span>
                        <span className={cn('shrink-0 text-xs', t.unread ? 'font-semibold text-accent' : 'text-muted-foreground')}>{shortTime(t.last.at, now)}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={cn('truncate text-sm', t.unread ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                          {t.last.mine && 'You: '}
                          {t.last.body}
                        </span>
                        {t.unread ? <span className="ml-auto size-2.5 shrink-0 rounded-full bg-accent" aria-label="Unread" /> : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Open conversation */}
        <section aria-label="Conversation" className={cn('flex min-h-0 flex-col', !selected && 'max-md:hidden')}>
          {selected ? (
            <Conversation key={selected.item.id} item={selected.item} busy={busy} onBack={close} onAction={act} onDelete={() => setToDelete(selected.item)} onSent={() => router.refresh()} />
          ) : (
            <div className="m-auto grid max-w-xs justify-items-center gap-2 p-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MessagesSquare className="size-6" aria-hidden />
              </span>
              <p className="font-semibold">Select a request</p>
              <p className="text-sm text-muted-foreground">Choose a conversation on the left to read it and reply.</p>
            </div>
          )}
        </section>
      </div>
      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} title="Delete this request?" description={`The request from ${toDelete?.name ?? 'this client'} and the whole conversation will be permanently removed.`} confirmLabel="Delete request" loading={busy} onConfirm={remove} />
    </>
  );
}

function Conversation({
  item,
  busy,
  onBack,
  onAction,
  onDelete,
  onSent,
}: {
  item: InboxItem;
  busy: boolean;
  onBack: () => void;
  onAction: (item: InboxItem, status: InboxItem['status'], message: string) => void;
  onDelete: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const link = contactLink(item.contact);
  const entries: InboxMessage[] = [{ id: 'request', sender: 'client', body: item.message, createdAt: item.createdAt }, ...item.messages];
  const lastMine = [...item.messages].reverse().find((m) => m.sender === 'pro');
  const seen = !!lastMine && !!item.clientReadAt && item.clientReadAt >= lastMine.createdAt;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [item.messages.length]);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const result = await api<{ emailed: boolean }>(`/api/inbox/${item.id}/messages`, { method: 'POST', body: { body } });
      setBody('');
      toast.success(result.emailed ? `Sent and emailed to ${item.name}` : 'Reply sent');
      onSent();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b p-3">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack} aria-label="Back to requests">
          <ArrowLeft aria-hidden />
        </Button>
        <Avatar name={item.name} size="lg" />
        <div className="grid min-w-0 flex-1">
          <p className="truncate font-semibold">{item.name}</p>
          {link ? (
            <a href={link.href} className="inline-flex items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground hover:underline">
              {link.kind === 'phone' ? <Phone className="size-3.5" aria-hidden /> : <Mail className="size-3.5" aria-hidden />} {item.contact}
            </a>
          ) : (
            <p className="truncate text-sm text-muted-foreground">{item.contact}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild size="sm" className="max-sm:px-2.5">
            <Link href="/quotations/new" aria-label="Create quotation">
              <FileText aria-hidden /> <span className="max-sm:hidden">Quotation</span>
            </Link>
          </Button>
          {item.status !== 'archived' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAction(item, 'new', 'Marked as unread')} aria-label="Mark as unread" title="Mark as unread">
              <MailOpen aria-hidden />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onAction(item, item.status === 'archived' ? 'read' : 'archived', item.status === 'archived' ? 'Moved to inbox' : 'Archived')}
            aria-label={item.status === 'archived' ? 'Move to inbox' : 'Archive'}
            title={item.status === 'archived' ? 'Move to inbox' : 'Archive'}
          >
            {item.status === 'archived' ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={onDelete} aria-label="Delete" title="Delete">
            <Trash2 aria-hidden />
          </Button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-subtle px-3 py-4 sm:px-5">
        <ol className="grid gap-2" aria-label={`Conversation with ${item.name}`}>
          {entries.map((m, i) => {
            const mine = m.sender === 'pro';
            const newDay = i === 0 || new Date(entries[i - 1]!.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
            const grouped = i > 0 && entries[i - 1]!.sender === m.sender && !newDay && m.createdAt - entries[i - 1]!.createdAt < 10 * 60_000;
            return (
              <li key={m.id} className="grid">
                {newDay && <p className="my-2 justify-self-center rounded-full bg-background px-3 py-1 text-xs text-muted-foreground shadow-card">{dayLabel(m.createdAt)}</p>}
                {i === 0 && <p className="mb-1 text-xs font-medium text-muted-foreground">Quotation request</p>}
                <div
                  className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-card', mine ? 'justify-self-end rounded-br-md bg-primary text-primary-foreground' : 'justify-self-start rounded-bl-md bg-background', grouped && 'mt-[-0.25rem]')}
                  title={fullTime(m.createdAt)}
                >
                  <p className="whitespace-pre-line leading-relaxed">{m.body}</p>
                  <p className={cn('mt-1 text-right text-[11px]', mine ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{new Date(m.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</p>
                </div>
              </li>
            );
          })}
        </ol>
        {lastMine && (
          <p className="mt-1 flex items-center justify-end gap-1 text-xs text-muted-foreground">
            {seen ? <CheckCheck className="size-3.5 text-accent" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
            {seen ? 'Seen' : item.clientGetsEmail ? 'Sent · emailed' : 'Sent'}
          </p>
        )}
        {!item.emailSent && <p className="mt-3 text-center text-xs text-muted-foreground">The email notice for this request was not delivered.</p>}
      </div>

      <form onSubmit={send} className="grid gap-1.5 border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            aria-label={`Reply to ${item.name}`}
            rows={1}
            maxLength={2000}
            value={body}
            placeholder={`Reply to ${item.name}…`}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            className="max-h-40 min-h-11 resize-none [field-sizing:content]"
          />
          <Button type="submit" loading={sending} disabled={!body.trim()} aria-label="Send reply" className="shrink-0">
            <Send aria-hidden /> <span className="max-sm:hidden">Send</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter to send · Shift+Enter for a new line · {item.clientGetsEmail ? 'They also get your reply by email.' : 'They read it on their private conversation link.'}
        </p>
      </form>
    </>
  );
}

