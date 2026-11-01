import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IAuditActor {
  name?: string;
  via: 'web' | 'pos' | 'system';
}

export interface IAuditTarget {
  type: string;
  id?: string;
  label?: string;
}

export interface IAuditEntry {
  _id?: string;
  restaurantId?: string;
  action: string;
  actor: IAuditActor;
  target: IAuditTarget;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  at?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const AuditEntrySchema = new Schema<IAuditEntry>(
  {
    action: { type: String, required: true, index: true },
    actor: {
      name: { type: String },
      via: { type: String, enum: ['web', 'pos', 'system'], default: 'web' },
    },
    target: {
      type: { type: String, required: true },
      id: { type: String },
      label: { type: String },
    },
    changes: {
      before: { type: Schema.Types.Mixed },
      after: { type: Schema.Types.Mixed },
    },
    at: { type: String, default: () => new Date().toISOString(), index: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
  }
);

AuditEntrySchema.plugin(tenantPlugin);
AuditEntrySchema.index({ restaurantId: 1, at: -1 });
// One order's history (GET /orders/:id/timeline).
AuditEntrySchema.index({ restaurantId: 1, 'target.type': 1, 'target.id': 1, at: 1 });

const AuditEntry: Model<IAuditEntry> =
  mongoose.models.AuditEntry || mongoose.model<IAuditEntry>('AuditEntry', AuditEntrySchema);

export default AuditEntry;
