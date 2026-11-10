import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** Each staff member reads a particular customer thread independently. */
export interface IWhatsAppRead {
  restaurantId?: string;
  userId: string;
  branchId: string;
  phoneNumberId: string;
  phone: string;
  readThrough: Date;
}

const schema = new Schema<IWhatsAppRead>({
  userId: { type: String, required: true },
  branchId: { type: String, required: true },
  phoneNumberId: { type: String, required: true },
  phone: { type: String, required: true },
  readThrough: { type: Date, required: true },
}, { timestamps: true });
schema.plugin(tenantPlugin);
schema.index({ restaurantId: 1, userId: 1, phoneNumberId: 1, phone: 1 }, { unique: true });

const WhatsAppRead: Model<IWhatsAppRead> = mongoose.models.WhatsAppRead ||
  mongoose.model<IWhatsAppRead>('WhatsAppRead', schema);
export default WhatsAppRead;
