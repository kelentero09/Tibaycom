'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, FileText, Inbox, LogOut, MessageSquareText, Settings, Shield, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown';

type Props = { name: string; email: string; username: string | null; isAdmin: boolean; newInquiries: number; /** Replies to requests this member sent, not yet read. */ unreadReplies?: number };

/** The only "account navigation" in the product — there is deliberately no separate customer dashboard. */
export function UserMenu({ name, email, username, isAdmin, newInquiries, unreadReplies = 0 }: Props) {
  const router = useRouter();
  const signOut = async () => {
    const { error } = await authClient.signOut();
    if (error) return void toast.error('Could not sign out. Please try again.');
    router.push('/');
    router.refresh();
  };
  const initial = (name.trim()[0] ?? '?').toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="relative flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 active:scale-95"
        aria-label={newInquiries > 0 ? `Account menu, ${newInquiries} new request${newInquiries === 1 ? '' : 's'}` : 'Account menu'}
      >
        {initial}
        {newInquiries + unreadReplies > 0 && <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-background bg-accent" aria-hidden />}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="max-w-56 truncate">{email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={username ? `/p/${username}` : '/onboarding'}>
            <UserRound aria-hidden /> {username ? 'My profile' : 'Create my profile'}
          </Link>
        </DropdownMenuItem>
        {username && (
          <DropdownMenuItem asChild>
            <Link href="/inbox">
              <Inbox aria-hidden /> Requests
              {newInquiries > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium leading-none text-accent-foreground">{newInquiries}</span>}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/account/requests">
            <MessageSquareText aria-hidden /> My requests
            {unreadReplies > 0 && <span className="ml-auto rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium leading-none text-accent-foreground">{unreadReplies}</span>}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/quotations">
            <FileText aria-hidden /> Quotations
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/subscription">
            <CreditCard aria-hidden /> Subscription
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/security">
            <Settings aria-hidden /> Account settings
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield aria-hidden /> Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut aria-hidden /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
