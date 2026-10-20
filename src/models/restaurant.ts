import mongoose, { Schema, type Document, type Model } from 'mongoose';

export interface IRestaurant {
  _id?: string;
  name: string;
  logo?: string;
  status?: 'active' | 'deleting';
  deleteAfter?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const RestaurantSchema = new Schema<IRestaurant>(
  {
    name: { type: String, required: true, trim: true },
    logo: { type: String },
    status: { type: String, enum: ['active', 'deleting'], default: 'active' },
    deleteAfter: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Restaurant: Model<IRestaurant> =
  mongoose.models.Restaurant || mongoose.model<IRestaurant>('Restaurant', RestaurantSchema);

export default Restaurant;
