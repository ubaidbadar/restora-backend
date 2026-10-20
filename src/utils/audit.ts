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
}

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
        at: new Date().toISOString(),
      })
    );
  } catch (error) {
    console.error('Failed to log audit entry:', error);
  }
}

export default logAudit;
