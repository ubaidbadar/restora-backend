import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface ITable {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  name: string;
  section?: string;
  seats?: number | null;
  /** What follows /t/ in its QR link: `restaurant/table-key` (older tables: a random code). */
  qrCode: string;
  /** Earlier codes still printed on cards, which open the table too. A new QR code clears them. */
  oldCodes?: string[];
  archived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const TableSchema = new Schema<ITable>(
  {
    branchId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    section: { type: String, trim: true, default: '' },
    seats: { type: Number, default: null },
    qrCode: { type: String, required: true, unique: true },
    oldCodes: { type: [String], default: undefined, index: true },
    archived: { type: Boolean, default: false, index: true },
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

TableSchema.plugin(tenantPlugin);
TableSchema.index({ restaurantId: 1, branchId: 1, archived: 1 });

const Table: Model<ITable> = mongoose.models.Table || mongoose.model<ITable>('Table', TableSchema);

export default Table;
