import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/** Inbox record; Meta's message ID is globally unique per restaurant, including outgoing messages. */
export interface IWhatsAppMessage {
  _id?: string;
  restaurantId?: string;
  branchId?: string;
  phoneNumberId: string;
  phone: string;
  from: string;
  to?: string;
  direction: 'inbound' | 'outbound';
  metaMessageId: string;
  messageType: string;
  text?: string;
  mediaId?: string;
  mediaMimeType?: string;
  interactiveId?: string;
  receivedAt: Date;
  processedAt?: Date;
  processingAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}
const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>({
  branchId: { type: String, index: true },
  phoneNumberId: { type: String, required: true, index: true },
  phone: { type: String, required: true, index: true },
  from: { type: String, required: true },
  to: String,
  direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound', required: true },
  metaMessageId: { type: String, required: true },
  messageType: { type: String, required: true },
  text: String,
  mediaId: String,
  mediaMimeType: String,
  interactiveId: String,
  receivedAt: { type: Date, required: true },
  processedAt: Date,
  processingAt: Date,
}, { timestamps: true });
WhatsAppMessageSchema.plugin(tenantPlugin);
WhatsAppMessageSchema.index({ restaurantId: 1, metaMessageId: 1 }, { unique: true });
WhatsAppMessageSchema.index({ restaurantId: 1, branchId: 1, phoneNumberId: 1, phone: 1, receivedAt: -1 });
const WhatsAppMessage: Model<IWhatsAppMessage> = mongoose.models.WhatsAppMessage || mongoose.model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);
export default WhatsAppMessage;
