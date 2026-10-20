import type { Context } from 'hono';
import AuditEntry from '../models/audit_entry';

export async function listAuditEntries(c: Context) {
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200);
  const action = c.req.query('action');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (action) filter.action = action;

  const entries = await AuditEntry.find(filter).sort({ at: -1, createdAt: -1 }).limit(limit);
  return c.json(entries);
}

export default {
  list: listAuditEntries,
};
