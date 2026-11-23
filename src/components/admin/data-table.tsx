'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createSortedRowModel, flexRender, rowSortingFeature, sortFn_basic, tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Inbox, MoreHorizontal, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api-client';
import { formatPHP } from '@/lib/money';
import { Button } from '../ui/button';
import { ConfirmDialog } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown';
import { Input, Select } from '../ui/form';
import { Badge, EmptyState, type BadgeVariant } from '../ui/misc';

type Value = string | number | null;
export type TableRow = Record<string, Value>;

/** Serializable column description, so server pages can configure tables without passing functions. */
export type ColumnSpec = {
  key: string;
  header: string;
  type?: 'text' | 'money' | 'date' | 'datetime' | 'badge' | 'boolean' | 'json';
  /** e.g. "/p/{username}" — placeholders are filled from the row. */
  href?: string;
  badges?: Record<string, BadgeVariant>;
  align?: 'right';
  sortable?: boolean;
};

export type RowAction = {
  label: string;
  /** Admin action name posted to /api/admin/actions/{action}. */
  action: string;
  /** Body built from row values: { userId: 'id' } sends { userId: row.id }. */
  payload: Record<string, string>;
  showWhen?: { key: string; equals?: Value; notEquals?: Value };
  confirm?: { title: string; description: string };
  destructive?: boolean;
  /** Constant values merged into the request body, e.g. { days: 30 }. */
  extra?: Record<string, Value>;
};

type Props = {
  columns: ColumnSpec[];
  rows: TableRow[];
  actions?: RowAction[];
  page: number;
  hasMore: boolean;
  searchPlaceholder?: string;
  statusOptions?: { value: string; label: string }[];
  exportResource?: string;
  emptyTitle?: string;
};

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns: { basic: sortFn_basic } });
const fill = (template: string, row: TableRow) => template.replace(/\{(\w+)\}/g, (_, key: string) => encodeURIComponent(String(row[key] ?? '')));
const formatDate = (value: Value, withTime: boolean) =>
  value == null ? '—' : new Date(Number(value)).toLocaleString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) });

function renderCell(spec: ColumnSpec, row: TableRow) {
  const value = row[spec.key] ?? null;
  let content: React.ReactNode;
  switch (spec.type) {
    case 'money':
      content = formatPHP(Number(value ?? 0));
      break;
    case 'date':
    case 'datetime':
      content = formatDate(value, spec.type === 'datetime');
      break;
    case 'badge':
      content = value == null || value === '' ? '—' : <Badge variant={spec.badges?.[String(value)] ?? 'neutral'}>{String(value)}</Badge>;
      break;
    case 'boolean':
      content = value ? 'Yes' : 'No';
      break;
    case 'json':
      content = value ? <code className="line-clamp-2 max-w-64 break-all text-xs text-muted-foreground">{String(value)}</code> : '—';
      break;
    default:
      content = value == null || value === '' ? '—' : String(value);
  }
  return spec.href && value != null && value !== '' ? (
    <Link href={fill(spec.href, row)} className="font-medium underline-offset-4 hover:underline">
      {content}
    </Link>
  ) : (
    content
  );
}

/** Admin list: server-side search / filter / pagination via the URL, client-side sorting of the visible page (TanStack Table). */
export function DataTable({ columns, rows, actions = [], page, hasMore, searchPlaceholder, statusOptions, exportResource, emptyTitle = 'Nothing here yet' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [pending, setPending] = useState<{ action: RowAction; row: TableRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const navigate = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) if (value) params.set(key, value); else params.delete(key);
    if (!('page' in patch)) params.delete('page');
    router.push(`${pathname}${params.size ? `?${params}` : ''}`);
  };

  const columnDefs = useMemo<ColumnDef<typeof features, TableRow>[]>(
    () => columns.map((spec) => ({ id: spec.key, accessorFn: (row: TableRow) => row[spec.key] ?? '', header: spec.header, enableSorting: spec.sortable !== false && spec.type !== 'json', sortFn: 'basic', cell: ({ row }) => renderCell(spec, row.original) })),
    [columns],
  );
  const table = useTable({ features, columns: columnDefs, data: rows });

  async function execute(action: RowAction, row: TableRow) {
    setBusy(true);
    try {
      const body: Record<string, Value> = Object.fromEntries(Object.entries(action.payload).map(([key, from]) => [key, row[from] ?? null]));
      Object.assign(body, action.extra);
      await api(`/api/admin/actions/${action.action}`, { method: 'POST', body });
      toast.success(`${action.label} — done`);
      setPending(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const visibleActions = (row: TableRow) =>
    actions.filter((a) => !a.showWhen || (a.showWhen.equals !== undefined ? row[a.showWhen.key] === a.showWhen.equals : row[a.showWhen.key] !== a.showWhen.notEquals));
  const exportHref = exportResource ? `/api/admin/export/${exportResource}?${new URLSearchParams([...searchParams].filter(([k]) => k === 'q' || k === 'status'))}` : null;

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {searchPlaceholder && (
          <form role="search" className="relative flex-1" onSubmit={(e) => (e.preventDefault(), navigate({ q: query.trim() }))}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} className="pl-9" value={query} maxLength={80} onChange={(e) => setQuery(e.target.value)} />
          </form>
        )}
        {statusOptions && (
          <Select aria-label="Filter" className="sm:w-44" value={searchParams.get('status') ?? ''} onChange={(e) => navigate({ status: e.target.value })}>
            <option value="">All</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        )}
        {exportHref && (
          <Button asChild variant="outline">
            <a href={exportHref} download>
              <Download aria-hidden /> Export CSV
            </a>
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Inbox />} title={emptyTitle} description={searchParams.size ? 'No records match the current search or filter.' : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-subtle text-left text-xs text-muted-foreground">
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => {
                    const spec = columns.find((c) => c.key === header.column.id);
                    const sorted = header.column.getIsSorted();
                    return (
                      <th key={header.id} scope="col" aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined} className={`whitespace-nowrap px-3 py-2.5 font-medium ${spec?.align === 'right' || spec?.type === 'money' ? 'text-right' : ''}`}>
                        {header.column.getCanSort() ? (
                          <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {sorted === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : sorted === 'desc' ? <ArrowDown className="size-3" aria-hidden /> : <ChevronsUpDown className="size-3 opacity-50" aria-hidden />}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </th>
                    );
                  })}
                  {actions.length > 0 && <th scope="col" className="w-10 px-3 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const rowActions = visibleActions(row.original);
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-subtle/60">
                    {row.getAllCells().map((cell) => {
                      const spec = columns.find((c) => c.key === cell.column.id);
                      return (
                        <td key={cell.id} className={`max-w-72 truncate px-3 py-2.5 ${spec?.align === 'right' || spec?.type === 'money' ? 'text-right tabular-nums' : ''}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                    {actions.length > 0 && (
                      <td className="px-1 py-1 text-right">
                        {rowActions.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger className="inline-flex size-9 items-center justify-center rounded-md hover:bg-muted" aria-label="Row actions">
                              <MoreHorizontal className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              {rowActions.map((action) => (
                                <DropdownMenuItem key={action.label} destructive={action.destructive} onSelect={() => (action.confirm ? setPending({ action, row: row.original }) : void execute(action, row.original))}>
                                  {action.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {(page > 1 || hasMore) && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => navigate({ page: page > 2 ? String(page - 1) : '' })}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page}</span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => navigate({ page: String(page + 1) })}>Next</Button>
        </nav>
      )}

      {pending?.action.confirm && (
        <ConfirmDialog open onOpenChange={(open) => !open && setPending(null)} destructive={pending.action.destructive ?? false} title={pending.action.confirm.title} description={pending.action.confirm.description} confirmLabel={pending.action.label} loading={busy} onConfirm={() => execute(pending.action, pending.row)} />
      )}
    </div>
  );
}
