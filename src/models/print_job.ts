import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** One slip for one printer, waiting for its agent to print it. */
export interface IPrintJob {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  agentId: string;
  /** The printer's Windows name. */
  printer: string;
  kind: 'kitchen' | 'receipt';
  orderId: string;
  /** The order's clientId when it has one, else its id: what tells an offline print from the synced order's. */
  orderKey: string;
  width: 48 | 32;
  copies: number;
  /** The order as it was, with only this printer's dishes on a kitchen slip. */
  order: Record<string, unknown>;
  /** What the receipt header and footer carry. */
  header: Record<string, unknown>;
  status: 'pending' | 'printed' | 'failed';
  error?: string;
  printedAt?: string;
  /** Set on slips printed by themselves, so the same order never makes the same slip twice. Reprints have none. */
  autoKey?: string;
  createdAt?: Date;
}

const PrintJobSchema = new Schema<IPrintJob>(
  {
    branchId: { type: String, required: true },
    agentId: { type: String, required: true },
    printer: { type: String, required: true },
    kind: { type: String, enum: ['kitchen', 'receipt'], required: true },
    orderId: { type: String, required: true },
    orderKey: { type: String, required: true },
    width: { type: Number, default: 48 },
    copies: { type: Number, default: 1 },
    order: { type: Schema.Types.Mixed, required: true },
    header: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['pending', 'printed', 'failed'], default: 'pending' },
    error: { type: String },
    printedAt: { type: String },
    autoKey: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
  }
);

PrintJobSchema.plugin(tenantPlugin);
PrintJobSchema.index({ agentId: 1, status: 1, createdAt: 1 });
PrintJobSchema.index({ autoKey: 1 }, { unique: true, sparse: true });
// Slips are only worth printing for a short while; old ones go.
PrintJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

const PrintJob: Model<IPrintJob> = mongoose.models.PrintJob || mongoose.model<IPrintJob>('PrintJob', PrintJobSchema);

export default PrintJob;
