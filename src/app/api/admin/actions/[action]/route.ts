import { adminActionSchemas, isAdminAction, runAdminAction } from '@/server/admin/actions';
import { ApiError, parseBody, route } from '@/server/http';

/** Single entry point for administrative mutations. `route({ access: 'admin' })` enforces role + 2FA on every call. */
export const POST = route<'admin', { action: string }>({ access: 'admin', limit: { name: 'admin-action', max: 300, windowSeconds: 3600 } }, async ({ request, params, user, ip }) => {
  const action = params.action;
  if (!isAdminAction(action)) throw new ApiError(404, 'Unknown action.');
  const input = await parseBody(request, adminActionSchemas[action]);
  return runAdminAction(action, input as never, { admin: user, ip });
});
