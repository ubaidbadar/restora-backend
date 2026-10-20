import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IAddonOption {
  _id: string;
  name: string;
  price: number;
}

export interface IAddonGroup {
  _id?: string;
  restaurantId?: string;
  name: string;
  min: number;
  max: number;
  options: IAddonOption[];
  createdAt?: Date;
  updatedAt?: Date;
}

const AddonOptionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
  },
  {
    _id: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        return ret;
      },
    },
  }
);

const AddonGroupSchema = new Schema<IAddonGroup>(
  {
    name: { type: String, required: true, trim: true },
    min: { type: Number, required: true, min: 0, default: 0 },
    max: { type: Number, required: true, min: 1, default: 1 },
    options: { type: [AddonOptionSchema], default: [] },
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

AddonGroupSchema.plugin(tenantPlugin);

const AddonGroup: Model<IAddonGroup> = mongoose.models.AddonGroup || mongoose.model<IAddonGroup>('AddonGroup', AddonGroupSchema);

export default AddonGroup;
