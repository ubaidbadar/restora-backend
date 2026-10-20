import type { Schema, PipelineStage } from 'mongoose';
import { getTenantId, hasTenantStore, isBypassTenant } from '../../middlewares/tenant_context';
import httpError from '../../utils/http_error';

/**
 * The restaurant a query must be limited to, or null when it may run as written.
 * Inside a request with no restaurant picked, tenant data is refused rather than read across every restaurant.
 */
function tenantFor(): string | null {
  if (isBypassTenant()) return null;
  const tenant = getTenantId();
  if (tenant) return tenant;
  if (hasTenantStore()) throw httpError(400, 'Pick a restaurant first');
  return null;
}

export default function tenantPlugin(schema: Schema) {
  if (!schema.path('restaurantId')) {
    schema.add({
      restaurantId: {
        type: String,
        required: true,
        index: true,
      },
    });
  }

  const queryMethods = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndReplace',
    'replaceOne',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
    'countDocuments',
    'distinct',
  ] as const;

  for (const method of queryMethods) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.pre(method as any, function (this: any) {
      const tenant = tenantFor();
      if (!tenant) return;
      // Always pin the tenant: a restaurantId already in the filter is replaced by it, never trusted.
      this.where({ restaurantId: tenant });
    });
  }

  // Aggregations bypass query middleware, so the tenant match is put first in the pipeline.
  schema.pre('aggregate', function () {
    const tenant = tenantFor();
    if (!tenant) return;
    this.pipeline().unshift({ $match: { restaurantId: tenant } } as PipelineStage);
  });

  // New documents get the current restaurant; one that names another restaurant is refused.
  schema.pre('validate', function () {
    const tenant = tenantFor();
    if (!tenant) return;
    const current = this.get('restaurantId');
    if (!current) this.set('restaurantId', tenant);
    else if (String(current) !== tenant) throw httpError(403, 'That record belongs to another restaurant');
  });

  schema.pre('insertMany', function (docs: unknown[]) {
    const tenant = tenantFor();
    if (!tenant) return;
    for (const doc of docs as Array<Record<string, unknown>>) {
      if (!doc.restaurantId) doc.restaurantId = tenant;
      else if (String(doc.restaurantId) !== tenant) throw httpError(403, 'That record belongs to another restaurant');
    }
  });
}
