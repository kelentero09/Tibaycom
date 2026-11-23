import Link from 'next/link';
import { HardHat } from 'lucide-react';
import { getSession, isAdmin } from '@/server/auth';
import { getProfileByUserId } from '@/server/profiles';
import { Button } from './ui/button';
import { UserMenu } from './user-menu';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ''}`} aria-label="Tibay home">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <HardHat className="size-4.5" aria-hidden />
      </span>
      <span className="text-lg">Tibay</span>
    </Link>
  );
}

export async function SiteHeader() {
  const session = await getSession();
  const profile = session ? await getProfileByUserId(session.user.id) : null;
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="container-page flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/directory" className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground">
              Find professionals
            </Link>
            <Link href="/pricing" className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground">
              Pricing
            </Link>
          </nav>
        </div>
        {session ? (
          <UserMenu name={session.user.name} email={session.user.email} username={profile?.username ?? null} isAdmin={isAdmin(session.user)} />
        ) : (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Join free</Link>
            </Button>
          </div>
        )}
      </div>
      <nav aria-label="Main mobile" className="container-page flex gap-1 border-t py-1 text-sm sm:hidden">
        <Link href="/directory" className="rounded-md px-3 py-2 text-muted-foreground">
          Find professionals
        </Link>
        <Link href="/pricing" className="rounded-md px-3 py-2 text-muted-foreground">
          Pricing
        </Link>
      </nav>
    </header>
  );
}

const footerLinks = [
  { href: '/directory', label: 'Directory' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t bg-subtle">
      <div className="container-page flex flex-col gap-6 py-10 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">The online home of Filipino contractors, architects, engineers and skilled workers.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
          {footerLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container-page border-t py-4 text-xs text-muted-foreground">© {new Date().getFullYear()} Tibay. All rights reserved.</div>
    </footer>
  );
}
