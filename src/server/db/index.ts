import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getEnv = () => getCloudflareContext().env;

/** Reads a setting that may legitimately be absent (optional integrations such as Google sign-in or alert webhooks). */
export const optionalEnv = (name: string): string | undefined => {
  const value = (getEnv() as unknown as Record<string, unknown>)[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/** A fresh client per call: binding handles must never be shared across requests on Workers. */
export const getDb = () => drizzle(getEnv().DB, { schema });
export type Db = ReturnType<typeof getDb>;
export { schema };

export const newId = () => crypto.randomUUID();
export const isProduction = () => getEnv().APP_ENV === 'production';
