import { PageHeader } from '@/components/ui/misc';
import { adminLists, type AdminResource } from '@/server/admin/queries';
import { DataTable, type ColumnSpec, type RowAction } from './data-table';

export type ListSearchParams = Promise<{ q?: string; page?: string; status?: string }>;

type Props = {
  title: string;
  description: string;
  resource: AdminResource;
  searchParams: ListSearchParams;
  columns: ColumnSpec[];
  actions?: RowAction[];
  searchPlaceholder?: string;
  statusOptions?: { value: string; label: string }[];
  exportable?: boolean;
  emptyTitle?: string;
};

/** One shared implementation for every admin list: URL-driven search, filter, pagination and CSV export. */
export async function AdminListPage({ title, description, resource, searchParams, exportable = true, ...table }: Props) {
  const params = await searchParams;
  const page = Math.max(1, Math.min(10_000, Number(params.page) || 1));
  const { rows, hasMore } = await adminLists[resource]({ q: params.q?.slice(0, 80), status: params.status, page });
  return (
    <div className="grid gap-6">
      <PageHeader title={title} description={description} />
      <DataTable rows={rows} page={page} hasMore={hasMore} exportResource={exportable ? resource : undefined} {...table} />
    </div>
  );
}
