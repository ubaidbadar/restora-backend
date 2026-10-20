import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IDailyCounter {
  _id?: string;
  restaurantId: string;
  branchId: string;
  dayKey: string;
  seq?: number;
}

const DailyCounterSchema = new Schema<IDailyCounter>(
  {
    restaurantId: { type: String, required: true },
    branchId: { type: String, required: true },
    dayKey: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

DailyCounterSchema.index({ restaurantId: 1, branchId: 1, dayKey: 1 }, { unique: true });

const DailyCounter: Model<IDailyCounter> =
  mongoose.models.DailyCounter || mongoose.model<IDailyCounter>('DailyCounter', DailyCounterSchema);

export default DailyCounter;
