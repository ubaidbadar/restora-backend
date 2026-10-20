import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IKhataEntry {
  _id?: string;
  restaurantId?: string;
  customerId: string;
  type: 'order' | 'adjustment' | 'payment' | 'reversal' | 'opening' | 'merge';
  amount: number;
  orderToken?: number;
  reversedAt?: string;
  note?: string;
  by?: { name: string };
  balanceAfter: number;
  createdAt?: string;
  updatedAt?: string;
}

const KhataEntrySchema = new Schema<IKhataEntry>(
  {
    customerId: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['order', 'adjustment', 'payment', 'reversal', 'opening', 'merge'],
      required: true,
      index: true,
    },
    amount: { type: Number, required: true },
    orderToken: { type: Number },
    reversedAt: { type: String },
    note: { type: String, trim: true },
    by: {
      name: { type: String },
    },
    balanceAfter: { type: Number, required: true },
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

KhataEntrySchema.plugin(tenantPlugin);
KhataEntrySchema.index({ restaurantId: 1, customerId: 1, createdAt: -1 });

const KhataEntry: Model<IKhataEntry> =
  mongoose.models.KhataEntry || mongoose.model<IKhataEntry>('KhataEntry', KhataEntrySchema);

export default KhataEntry;
