import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/**
 * Dedupe record for inbound WhatsApp messages. Meta may deliver the
 * same message twice; the webhook must never act on one twice.
 * One row per Meta message id, per restaurant. Message content is
 * deliberately NOT stored here beyond its type: only what the order
 * flow needs is kept on the order itself.
 */
export interface IWhatsAppMessage {
  _id?: string;
  restaurantId?: string;
  phoneNumberId: string;
  from: string;
  metaMessageId: string;
  messageType: string;
  receivedAt: Date;
  createdAt?: string;
  updatedAt?: string;
}

const WhatsAppMessageSchema = new Schema<IWhatsAppMessage>(
  {
    phoneNumberId: { type: String, required: true, index: true },
    from: { type: String, required: true },
    metaMessageId: { type: String, required: true, index: true },
    messageType: { type: String, required: true },
    receivedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

WhatsAppMessageSchema.plugin(tenantPlugin);
WhatsAppMessageSchema.index({ restaurantId: 1, metaMessageId: 1 }, { unique: true });

const WhatsAppMessage: Model<IWhatsAppMessage> =
  mongoose.models.WhatsAppMessage ||
  mongoose.model<IWhatsAppMessage>('WhatsAppMessage', WhatsAppMessageSchema);

export default WhatsAppMessage;
