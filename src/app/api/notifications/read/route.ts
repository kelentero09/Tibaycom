import { and, eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/server/db';
import { route } from '@/server/http';

export const POST = route({ access: 'user', limit: { name: 'notifications-read', max: 120, windowSeconds: 600 } }, async ({ user }) => {
  const { notifications } = schema;
  await getDb()
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), sql`${notifications.readAt} IS NULL`));
  return { ok: true };
});
