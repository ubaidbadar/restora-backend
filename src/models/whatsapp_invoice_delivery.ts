import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** Durable record of each WhatsApp invoice attempt; no templates are sent by this system. */
export interface IWhatsAppInvoiceDelivery {
  restaurantId?: string;
  orderId: string;
  stage: 'confirmed' | 'completed';
  phoneNumberId: string;
  phone: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'template_required';
  billMessageId?: string;
  documentMessageId?: string;
  lastError?: string;
  sentAt?: Date;
  updatedAt?: Date;
}
const schema = new Schema<IWhatsAppInvoiceDelivery>({
  orderId: { type: String, required: true },
  stage: { type: String, enum: ['confirmed', 'completed'], required: true },
  phoneNumberId: { type: String, required: true },
  phone: { type: String, required: true },
  status: { type: String, enum: ['pending','sending','sent','failed','template_required'], default: 'pending' },
  billMessageId: String, documentMessageId: String,
  lastError: String, sentAt: Date,
}, { timestamps: true });
schema.plugin(tenantPlugin);
schema.index({ restaurantId: 1, orderId: 1, stage: 1 }, { unique: true });
schema.index({ restaurantId: 1, status: 1 });
const WhatsAppInvoiceDelivery: Model<IWhatsAppInvoiceDelivery> =
  mongoose.models.WhatsAppInvoiceDelivery || mongoose.model<IWhatsAppInvoiceDelivery>('WhatsAppInvoiceDelivery', schema);
export default WhatsAppInvoiceDelivery;
