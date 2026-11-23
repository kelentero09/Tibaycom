import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { DirectoryFilters } from '@/components/directory-filters';
import { ProfessionalCard } from '@/components/professional-card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { professionLabel } from '@/lib/professions';
import { directoryQuerySchema } from '@/lib/validation';
import { getT } from '@/server/locale';
import { searchDirectory } from '@/server/profiles';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const parse = async (searchParams: Props['searchParams']) => {
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return directoryQuerySchema.parse(flat);
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await parse(searchParams);
  const who = query.profession ? `${professionLabel(query.profession)}s` : 'Construction professionals';
  const where = [query.city, query.province].filter(Boolean).join(', ');
  return {
    title: `${who}${where ? ` in ${where}` : ' in the Philippines'}`,
    description: `Browse ${who.toLowerCase()}${where ? ` in ${where}` : ' across the Philippines'}. View portfolios and request quotations — no account needed.`,
    alternates: { canonical: '/directory' },
    robots: query.q || query.page > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function DirectoryPage({ searchParams }: Props) {
  const query = await parse(searchParams);
  const [{ results, hasMore }, t] = await Promise.all([searchDirectory(query), getT()]);
  const pageHref = (page: number) => {
    const params = new URLSearchParams(Object.entries({ ...query, page: page > 1 ? String(page) : '' }).filter(([, v]) => v) as [string, string][]);
    return `/directory${params.size ? `?${params}` : ''}`;
  };

  return (
    <div className="container-page grid gap-6 py-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold sm:text-3xl">{t.directory.title}</h1>
        <p className="text-muted-foreground">{t.directory.subtitle}</p>
      </div>
      <DirectoryFilters
        key={JSON.stringify(query)}
        initial={{ q: query.q ?? '', profession: query.profession ?? '', specialization: query.specialization ?? '', province: query.province ?? '', city: query.city ?? '' }}
      />
      {results.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t.directory.emptyTitle}
          description={t.directory.emptyBody}
          action={
            <Button asChild variant="outline">
              <Link href="/directory">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((pro, index) => (
            <li key={pro.id} className="stagger" style={{ '--i': index } as React.CSSProperties}>
              <ProfessionalCard pro={pro} />
            </li>
          ))}
        </ul>
      )}
      {(query.page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {query.page > 1 ? (
            <Button asChild variant="outline">
              <Link href={pageHref(query.page - 1)} rel="prev">
                Previous
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">Page {query.page}</span>
          {hasMore ? (
            <Button asChild variant="outline">
              <Link href={pageHref(query.page + 1)} rel="next">
                Next
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
