import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type Permission from '@shared/permission';
import tenantPlugin from './plugins/tenant_plugin';

export interface IRole {
  _id?: string;
  restaurantId?: string;
  name: string;
  description?: string;
  key?: string;
  isPreset?: boolean;
  permissions: Permission[];
  createdAt?: Date;
  updatedAt?: Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    key: { type: String, trim: true },
    isPreset: { type: Boolean, default: false },
    permissions: { type: [String], default: [] },
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

RoleSchema.plugin(tenantPlugin);
RoleSchema.index({ restaurantId: 1, key: 1 });

const Role: Model<IRole> = mongoose.models.Role || mongoose.model<IRole>('Role', RoleSchema);

export default Role;
