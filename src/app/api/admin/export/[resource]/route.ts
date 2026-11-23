import { adminLists, isAdminResource, toCsv } from '@/server/admin/queries';
import { audit } from '@/server/audit';
import { ApiError, route } from '@/server/http';

export const GET = route<'admin', { resource: string }>({ access: 'admin', limit: { name: 'admin-export', max: 30, windowSeconds: 3600 } }, async ({ request, params, user, ip }) => {
  const resource = params.resource;
  if (!isAdminResource(resource)) throw new ApiError(404, 'Unknown export.');
  const url = new URL(request.url);
  const { rows } = await adminLists[resource]({ q: url.searchParams.get('q') ?? undefined, status: url.searchParams.get('status') ?? undefined, forExport: true });
  const dated = rows.map((row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'number' && /(At|Start|End)$/.test(key) && value > 1e11 ? new Date(value).toISOString() : value])),
  );
  await audit({ actorId: user.id, actorType: 'admin', action: 'admin.export', targetType: resource, metadata: { rows: rows.length }, ip });
  return new Response(`\uFEFF${toCsv(dated)}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="tibay-${resource}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'cache-control': 'no-store',
    },
  });
});
