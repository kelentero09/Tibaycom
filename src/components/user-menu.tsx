'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, FileText, LogOut, Settings, Shield, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown';

type Props = { name: string; email: string; username: string | null; isAdmin: boolean };

/** The only "account navigation" in the product — there is deliberately no separate customer dashboard. */
export function UserMenu({ name, email, username, isAdmin }: Props) {
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
      <DropdownMenuTrigger className="flex size-10 items-center justify-center rounded-full bg-muted text-sm font-semibold" aria-label="Account menu">
        {initial}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel className="max-w-56 truncate">{email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={username ? `/p/${username}` : '/onboarding'}>
            <UserRound aria-hidden /> {username ? 'My profile' : 'Create my profile'}
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
