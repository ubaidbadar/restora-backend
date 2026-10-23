import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IGuestRequest {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  tableId: string;
  /** The table's name when the guest called, so a live alert can say where without a lookup. */
  tableName?: string;
  type: 'waiter' | 'bill';
  resolved?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const GuestRequestSchema = new Schema<IGuestRequest>(
  {
    branchId: { type: String, required: true, index: true },
    tableId: { type: String, required: true, index: true },
    tableName: { type: String },
    type: { type: String, enum: ['waiter', 'bill'], required: true },
    resolved: { type: Boolean, default: false, index: true },
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

GuestRequestSchema.plugin(tenantPlugin);
// Live updates on a standalone MongoDB read what changed lately (services/order_events).
GuestRequestSchema.index({ updatedAt: 1 });
GuestRequestSchema.index({ restaurantId: 1, tableId: 1, resolved: 1 });

const GuestRequest: Model<IGuestRequest> =
  mongoose.models.GuestRequest || mongoose.model<IGuestRequest>('GuestRequest', GuestRequestSchema);

export default GuestRequest;
