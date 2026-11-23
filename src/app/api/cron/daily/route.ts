import { timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/server/db';
import { runDailyMaintenance } from '@/server/maintenance';

/** Invoked by the Worker's Cron Trigger (see custom-worker.ts). Authenticated with a shared secret, not a session. */
export async function POST(request: Request) {
  const secret = getEnv().CRON_SECRET;
  const given = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) return new Response('Not found', { status: 404 });
  return Response.json(await runDailyMaintenance());
}
