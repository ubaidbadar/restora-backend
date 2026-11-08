import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** One editable WhatsApp cart per connected number and customer. It is not an order. */
export interface IWhatsAppCart {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  phoneNumberId: string;
  phone: string;
  items: { itemId: string; sizeId?: string; qty: number }[];
  state: 'active' | 'confirming' | 'confirmed';
  generation: number;
  quoteFingerprint?: string;
  orderId?: string;
  pendingItemId?: string;
  pendingSizeId?: string;
  updatedAt?: Date;
}
const CartSchema = new Schema<IWhatsAppCart>({
  branchId: { type: String, required: true },
  phoneNumberId: { type: String, required: true },
  phone: { type: String, required: true },
  items: [{ _id: false, itemId: { type: String, required: true }, sizeId: String, qty: { type: Number, required: true, min: 1, max: 20 } }],
  state: { type: String, enum: ['active','confirming','confirmed'], default: 'active' },
  generation: { type: Number, default: 0 },
  quoteFingerprint: String,
  orderId: String,
  pendingItemId: String,
  pendingSizeId: String,
}, { timestamps: true });
CartSchema.plugin(tenantPlugin);
CartSchema.index({ restaurantId: 1, phoneNumberId: 1, phone: 1 }, { unique: true });
CartSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 86400 });
const WhatsAppCart: Model<IWhatsAppCart> = mongoose.models.WhatsAppCart || mongoose.model<IWhatsAppCart>('WhatsAppCart', CartSchema);
export default WhatsAppCart;
