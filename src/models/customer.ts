import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface ILastOrder {
  items: {
    itemId: string;
    name: string;
    sizeName?: string;
    addons?: { name: string; price: number }[];
    note?: string;
    price: number;
    qty: number;
  }[];
  type: 'dine_in' | 'takeaway' | 'delivery';
  paymentMethod?: 'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank';
  total: number;
  area?: string;
  address?: string;
}

export interface ICustomer {
  _id?: string;
  restaurantId?: string;
  name: string;
  phone: string;
  altPhone?: string;
  addresses?: string[];
  area?: string;
  notes?: string;
  tags?: string[];
  khataBalance?: number;
  orderCount?: number;
  totalSpent?: number;
  lastOrderAt?: string;
  lastOrder?: ILastOrder;
  source?: 'staff' | 'qr' | 'import';
  whatsappOptIn?: { at: string; source: string };
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

const LastOrderSchema = new Schema(
  {
    items: [
      {
        itemId: { type: String, required: true },
        name: { type: String, required: true },
        sizeName: { type: String },
        addons: [{ name: { type: String }, price: { type: Number } }],
        note: { type: String },
        price: { type: Number, required: true },
        qty: { type: Number, required: true },
      },
    ],
    type: { type: String, enum: ['dine_in', 'takeaway', 'delivery'], required: true },
    paymentMethod: { type: String, enum: ['cash', 'card', 'jazzcash', 'easypaisa', 'bank'] },
    total: { type: Number, required: true },
    area: { type: String },
    address: { type: String },
  },
  { _id: false }
);

const CustomerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    altPhone: { type: String, trim: true },
    addresses: { type: [String], default: [] },
    area: { type: String, trim: true },
    notes: { type: String, trim: true },
    tags: { type: [String], default: [] },
    khataBalance: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastOrderAt: { type: String },
    lastOrder: { type: LastOrderSchema },
    source: { type: String, enum: ['staff', 'qr', 'import'], default: 'staff' },
    whatsappOptIn: {
      at: { type: String },
      source: { type: String },
    },
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

CustomerSchema.plugin(tenantPlugin);
// One customer per mobile number in a restaurant, enforced by the database so two quick saves cannot both win.
CustomerSchema.index({ restaurantId: 1, phone: 1 }, { unique: true });
CustomerSchema.index({ restaurantId: 1, name: 1 });

const Customer: Model<ICustomer> = mongoose.models.Customer || mongoose.model<ICustomer>('Customer', CustomerSchema);

export default Customer;
