import Link from 'next/link';
import { HardHat } from 'lucide-react';
import { getSession, isAdmin } from '@/server/auth';
import { countUnreadNotifications } from '@/server/community';
import { getLocale, getT } from '@/server/locale';
import { countNewInquiries, getProfileByUserId } from '@/server/profiles';
import { countUnreadSentRequests } from '@/server/inquiries';
import { NotificationBell } from './community/notification-bell';
import { LanguageToggle } from './language-toggle';
import { Button } from './ui/button';
import { UserMenu } from './user-menu';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ''}`} aria-label="Tibay home">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-200 group-hover:-rotate-6">
        <HardHat className="size-4.5" aria-hidden />
      </span>
      <span className="text-lg">Tibay</span>
    </Link>
  );
}

const navLink = 'rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground';

export async function SiteHeader() {
  const [session, t, locale] = await Promise.all([getSession(), getT(), getLocale()]);
  const profile = session ? await getProfileByUserId(session.user.id) : null;
  const [newInquiries, unreadNotifications, unreadReplies] = await Promise.all([
    profile ? countNewInquiries(profile.id) : 0,
    session ? countUnreadNotifications(session.user.id) : 0,
    session ? countUnreadSentRequests(session.user.id) : 0,
  ]);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <div className="container-page flex h-14 items-center justify-between gap-3">
        <div className="flex items-center gap-5">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm sm:flex">
            <Link href="/directory" className={navLink}>
              {t.nav.find}
            </Link>
            <Link href="/community" className={navLink}>
              {t.nav.community}
            </Link>
            <Link href="/pricing" className={navLink}>
              {t.nav.pricing}
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <LanguageToggle locale={locale} label={t.nav.language} />
          {session && <NotificationBell initialUnread={unreadNotifications} />}
          {session ? (
            <UserMenu name={session.user.name} email={session.user.email} username={profile?.username ?? null} isAdmin={isAdmin(session.user)} newInquiries={newInquiries} unreadReplies={unreadReplies} />
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/login">{t.nav.login}</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">{t.nav.join}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <nav aria-label="Main mobile" className="container-page flex gap-1 border-t py-1 text-sm sm:hidden">
        <Link href="/directory" className={navLink}>
          {t.nav.find}
        </Link>
        <Link href="/community" className={navLink}>
          {t.nav.community}
        </Link>
        <Link href="/pricing" className={navLink}>
          {t.nav.pricing}
        </Link>
        {!session && (
          <Link href="/login" className={`${navLink} ml-auto`}>
            {t.nav.login}
          </Link>
        )}
      </nav>
    </header>
  );
}

export async function SiteFooter() {
  const t = await getT();
  const links = [
    { href: '/directory', label: t.footer.directory },
    { href: '/pricing', label: t.footer.pricing },
    { href: '/about', label: t.footer.about },
    { href: '/contact', label: t.footer.contact },
    { href: '/privacy', label: t.footer.privacy },
    { href: '/terms', label: t.footer.terms },
  ];
  return (
    <footer className="mt-20 border-t bg-subtle">
      <div className="container-page flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-3">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{t.footer.tagline}</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2.5 text-sm">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container-page border-t py-5 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Tibay. {t.footer.rights}
      </div>
    </footer>
  );
}
