import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

/**
 * One row per WhatsApp Business number a restaurant connects.
 * The routing key is phoneNumberId: Meta sends it on every incoming
 * message, and the webhook looks the restaurant up from it.
 * Access tokens are stored encrypted, never in plain text (see
 * src/utils/whatsapp_crypto.ts). A row without a token can receive
 * and log messages, but cannot send replies yet.
 */
export interface IWhatsAppConnection {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  wabaId: string;
  phoneNumberId: string;
  phoneNumberDisplay: string;
  accessTokenEncrypted?: string;
  status: 'connected' | 'disconnected' | 'token_expired' | 'number_pending';
  messagingLimit?: number;
  invoiceOnComplete?: boolean;
  connectedAt?: Date;
  createdAt?: string;
  updatedAt?: string;
}

const WhatsAppConnectionSchema = new Schema<IWhatsAppConnection>(
  {
    branchId: { type: String, required: true, index: true },
    wabaId: { type: String, required: true },
    phoneNumberId: { type: String, required: true, unique: true, index: true },
    phoneNumberDisplay: { type: String, required: true },
    accessTokenEncrypted: { type: String },
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'token_expired', 'number_pending'],
      default: 'number_pending',
      index: true,
    },
    messagingLimit: { type: Number },
    invoiceOnComplete: { type: Boolean, default: false },
    connectedAt: { type: Date },
  },
  { timestamps: true }
);

WhatsAppConnectionSchema.plugin(tenantPlugin);

const WhatsAppConnection: Model<IWhatsAppConnection> =
  mongoose.models.WhatsAppConnection ||
  mongoose.model<IWhatsAppConnection>('WhatsAppConnection', WhatsAppConnectionSchema);

export default WhatsAppConnection;
