import 'server-only';
import { getDb, newId, schema } from './db';

type AuditEntry = {
  actorId?: string | null;
  actorType: 'admin' | 'user' | 'system';
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
};

/** Append-only audit trail for administrative and payment events. Never throws into the caller. */
export async function audit(entry: AuditEntry) {
  try {
    await getDb()
      .insert(schema.auditLogs)
      .values({ id: newId(), ...entry, actorId: entry.actorId ?? null });
  } catch (error) {
    console.error('[audit] failed to write entry', entry.action, error);
  }
}
