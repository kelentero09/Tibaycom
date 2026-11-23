import 'server-only';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export const getEnv = () => getCloudflareContext().env;

/** A fresh client per call: binding handles must never be shared across requests on Workers. */
export const getDb = () => drizzle(getEnv().DB, { schema });
export type Db = ReturnType<typeof getDb>;
export { schema };

export const newId = () => crypto.randomUUID();
export const isProduction = () => getEnv().APP_ENV === 'production';
