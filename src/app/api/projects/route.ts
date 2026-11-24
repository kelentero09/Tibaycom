import { sql } from 'drizzle-orm';
import { projectSchema } from '@/lib/validation';
import { getDb, newId } from '@/server/db';
import { getEntitlements } from '@/server/entitlements';
import { ApiError, parseBody, route } from '@/server/http';
import { requireOwnProfile } from '@/server/profiles';

export const POST = route({ access: 'user', limit: { name: 'project-write', max: 60, windowSeconds: 3600 } }, async ({ request, user }) => {
  const input = await parseBody(request, projectSchema);
  const [profile, entitlements] = await Promise.all([requireOwnProfile(user.id), getEntitlements(user.id)]);
  const id = newId();
  const now = Date.now();
  // Limit check and insert in ONE statement, so parallel requests cannot exceed the plan limit.
  const inserted = await getDb().all<{ id: string }>(sql`
    INSERT INTO projects (id, profile_id, title, description, location, year, status, start_date, end_date, created_at, updated_at)
    SELECT ${id}, ${profile.id}, ${input.title}, ${input.description}, ${input.location}, ${input.year}, ${input.status}, ${input.startDate}, ${input.endDate}, ${now}, ${now}
    WHERE (SELECT COUNT(*) FROM projects WHERE profile_id = ${profile.id}) < ${entitlements.limits.projects}
    RETURNING id`);
  if (!inserted.length)
    throw new ApiError(402, `Your ${entitlements.plan === 'premium' ? 'Premium' : 'Free'} plan allows up to ${entitlements.limits.projects} projects.`, 'limit_reached');
  return { id };
});
