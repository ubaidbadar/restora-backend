import type { Context } from 'hono';
import type { PipelineStage } from 'mongoose';
import AuditEntry, { type IAuditActor, type IAuditTarget } from '../models/audit_entry';
import { getTenantId, runWithTenant } from '../middlewares/tenant_context';

export interface AuditParams {
  restaurantId?: string;
  action: string;
  actor: IAuditActor;
  target: IAuditTarget;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  at?: string;
}

/** Who made this request: their account, the name they go by now, and where (web or a POS terminal). */
export const auditActor = (c: Context): IAuditActor => ({ userId: c.get('user')?.id, name: c.get('user')?.name, via: c.get('via') ?? 'web' });

/**
 * Pipeline stages that show each entry's person as they are now, found by account: their current name and email, and
 * `was` with the name saved on the entry when they have been renamed since. A name alone can be changed or copied.
 * Entries from before accounts were saved, and from the system, keep just the saved name.
 */
export const withPerson: PipelineStage[] = [
  {
    $lookup: {
      from: 'user',
      let: { id: { $convert: { input: '$actor.userId', to: 'objectId', onError: null, onNull: null } } },
      pipeline: [{ $match: { $expr: { $eq: ['$_id', '$$id'] } } }, { $project: { name: 1, email: 1 } }],
      as: 'person',
    },
  },
  { $set: { person: { $first: '$person' } } },
  {
    $set: {
      actor: {
        via: '$actor.via',
        name: { $ifNull: ['$person.name', '$actor.name'] },
        email: '$person.email',
        was: { $cond: [{ $and: ['$person', { $ne: ['$person.name', '$actor.name'] }] }, '$actor.name', '$$REMOVE'] },
      },
    },
  },
  { $unset: ['person', 'actor.userId'] },
];

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    const restaurantId = params.restaurantId || getTenantId();
    if (!restaurantId) return;

    // Written in that restaurant's scope, also from routes that run before a restaurant is picked (onboarding, joining).
    await runWithTenant(restaurantId, () =>
      AuditEntry.create({
        restaurantId,
        action: params.action,
        actor: params.actor,
        target: { ...params.target, id: params.target.id === undefined ? undefined : String(params.target.id) },
        changes: params.changes,
        at: params.at || new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('Failed to log audit entry:', error);
  }
}

export default logAudit;
