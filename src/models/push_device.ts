import mongoose, { Schema, type Model } from 'mongoose';

/**
 * A phone (Expo push token) or a browser (web push subscription) that gets an alert when a guest orders from a table's
 * QR page or calls a waiter or for the bill. It belongs to the person signed in on it and the workplace they had open
 * when it was saved; the app saves it again on each start and switch, so it follows them.
 */
export interface IPushDevice {
  _id?: string;
  userId: string;
  restaurantId: string;
  /** The branch open on the device. Empty: every branch the person may see. */
  branchId?: string;
  kind: 'expo' | 'web';
  /** The Expo push token, or the browser's push endpoint. */
  token: string;
  /** Web push only: the browser's keys that encrypt each message. */
  keys?: { p256dh: string; auth: string };
  createdAt?: Date;
  updatedAt?: Date;
}

const PushDeviceSchema = new Schema<IPushDevice>(
  {
    userId: { type: String, required: true, index: true },
    restaurantId: { type: String, required: true },
    branchId: { type: String },
    kind: { type: String, enum: ['expo', 'web'], required: true },
    token: { type: String, required: true, unique: true },
    keys: { type: new Schema({ p256dh: { type: String, required: true }, auth: { type: String, required: true } }, { _id: false }) },
  },
  { timestamps: true }
);

PushDeviceSchema.index({ restaurantId: 1, branchId: 1 });

const PushDevice: Model<IPushDevice> = mongoose.models.PushDevice || mongoose.model<IPushDevice>('PushDevice', PushDeviceSchema);

export default PushDevice;
