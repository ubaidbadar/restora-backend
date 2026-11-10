import mongoose, { Schema, type Model } from 'mongoose';

/** Short-lived fixed-window counters shared by all API workers through MongoDB. */
interface IRateLimitBucket {
  _id: string;
  count: number;
  expiresAt: Date;
}

const schema = new Schema<IRateLimitBucket>({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitBucket: Model<IRateLimitBucket> = mongoose.models.RateLimitBucket ||
  mongoose.model<IRateLimitBucket>('RateLimitBucket', schema);
export default RateLimitBucket;
