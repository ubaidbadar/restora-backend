import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** A durable record that a bill could not be sent outside the 24-hour window.
 * A future approved template-message worker can process these records.
 * This model does NOT send or invent templates.
 */
export interface IWhatsAppInvoiceQueue {
  restaurantId?: string;
  branchId: string;
  orderId: string;
  phoneNumberId: string;
  phone: string;
  trigger: 'confirmed' | 'completed';
  state: 'template_required';
  createdAt?: Date;
}
const SchemaDef = new Schema<IWhatsAppInvoiceQueue>({
  branchId: { type: String, required: true },
  orderId: { type: String, required: true },
  phoneNumberId: { type: String, required: true },
  phone: { type: String, required: true },
  trigger: { type: String, required: true, enum: ['confirmed', 'completed'] },
  state: { type: String, required: true, enum: ['template_required'], default: 'template_required' },
}, { timestamps: true });
SchemaDef.plugin(tenantPlugin);
SchemaDef.index({ restaurantId: 1, orderId: 1, trigger: 1 }, { unique: true });
export default (mongoose.models.WhatsAppInvoiceQueue || mongoose.model<IWhatsAppInvoiceQueue>('WhatsAppInvoiceQueue', SchemaDef)) as Model<IWhatsAppInvoiceQueue>;
