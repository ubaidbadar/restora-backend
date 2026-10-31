import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';
import ORDER_STATUSES, { type OrderStatus } from '../constants/order_status';
import CANCEL_REASONS, { type CancelReason } from '../constants/cancel_reasons';

export interface IOrderItem {
  itemId: string;
  name: string;
  /** The size and add-ons as picked, so the order can be opened for editing. */
  sizeId?: string;
  sizeName?: string;
  addonIds?: string[];
  addons?: { name: string; price: number }[];
  /** For a deal: the dishes in it, per one deal, as they were when ordered (for the kitchen and the receipt). */
  includes?: { name: string; sizeName?: string; qty: number }[];
  note?: string;
  price: number;
  qty: number;
}

export interface IOrderCustomer {
  _id: string;
  name: string;
  phone: string;
}

/** Who cancelled the order, when and why. Older cancellations have no reason. */
export interface IOrderCancellation {
  reason?: CancelReason;
  note?: string;
  byName?: string;
  at: Date;
}

export interface IOrder {
  _id?: string;
  restaurantId?: string;
  dailyToken: number;
  branchId: string;
  customerId?: string;
  customer?: IOrderCustomer;
  type: 'dine_in' | 'takeaway' | 'delivery';
  status: OrderStatus;
  items: IOrderItem[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  deliveryFee: number;
  total: number;
  paymentMethod?: 'cash' | 'card' | 'jazzcash' | 'easypaisa' | 'bank';
  paymentStatus: 'paid' | 'unpaid' | 'khata';
  tableId?: string;
  tableName?: string;
  area?: string;
  address?: string;
  rider?: string;
  /** Name of the person who placed the order, printed on the receipt. */
  takenBy?: string;
  dayKey: string; // YYYY-MM-DD in PKT for querying/indexing
  /** Made on the device that took the order; sending it again (offline sync, a retry) returns the same order. */
  clientId?: string;
  /** When the order was taken, if that was before it reached the server (taken offline). */
  placedAt?: string;
  /** Set when the order is cancelled. */
  cancellation?: IOrderCancellation;
  /** When its dishes or details were last changed after it was placed (the receipt then says UPDATED). */
  editedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const OrderItemSchema = new Schema(
  {
    itemId: { type: String, required: true },
    name: { type: String, required: true },
    sizeId: { type: String },
    sizeName: { type: String },
    addonIds: { type: [String], default: undefined },
    addons: [{ name: { type: String }, price: { type: Number } }],
    includes: { type: [{ _id: false, name: { type: String }, sizeName: { type: String }, qty: { type: Number } }], default: undefined },
    note: { type: String },
    price: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const OrderCustomerSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const OrderCancellationSchema = new Schema(
  {
    reason: { type: String, enum: CANCEL_REASONS },
    note: { type: String },
    byName: { type: String },
    at: { type: Date, required: true },
  },
  { _id: false }
);

const OrderSchema = new Schema<IOrder>(
  {
    dailyToken: { type: Number, required: true },
    branchId: { type: String, required: true, index: true },
    customerId: { type: String, index: true },
    customer: { type: OrderCustomerSchema },
    type: { type: String, enum: ['dine_in', 'takeaway', 'delivery'], required: true },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'new',
      index: true,
    },
    items: { type: [OrderItemSchema], default: [] },
    subtotal: { type: Number, required: true, default: 0 },
    discount: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, required: true, default: 0 },
    tax: { type: Number, required: true, default: 0 },
    deliveryFee: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    paymentMethod: { type: String, enum: ['cash', 'card', 'jazzcash', 'easypaisa', 'bank'] },
    paymentStatus: { type: String, enum: ['paid', 'unpaid', 'khata'], default: 'unpaid', index: true },
    tableId: { type: String },
    tableName: { type: String },
    area: { type: String },
    address: { type: String },
    rider: { type: String },
    takenBy: { type: String },
    dayKey: { type: String, required: true, index: true },
    clientId: { type: String },
    placedAt: { type: String },
    cancellation: { type: OrderCancellationSchema },
    editedAt: { type: String },
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

OrderSchema.plugin(tenantPlugin);
// Live updates on a standalone MongoDB read what changed lately (services/order_events).
OrderSchema.index({ updatedAt: 1 });
OrderSchema.index({ restaurantId: 1, branchId: 1, dayKey: 1, dailyToken: 1 });
OrderSchema.index({ restaurantId: 1, createdAt: -1 });
// One order per device-made id: an order synced twice is saved once.
OrderSchema.index({ restaurantId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } });

const Order: Model<IOrder> = mongoose.models.Order || mongoose.model<IOrder>('Order', OrderSchema);

export default Order;
