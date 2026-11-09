import mongoose, { Schema, type Model } from 'mongoose';

/** Platform admins live outside restaurant tenant scoping. Never grant this via restaurant roles. */
export interface IPlatformAdmin {
  userId: string;
  role: 'owner' | 'analyst' | 'support';
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
const schema = new Schema<IPlatformAdmin>({
  userId: { type: String, required: true, unique: true, index: true },
  role: { type: String, enum: ['owner', 'analyst', 'support'], required: true },
  enabled: { type: Boolean, default: true },
}, { timestamps: true, collection: 'platform_admins' });
const PlatformAdmin: Model<IPlatformAdmin> = mongoose.models.PlatformAdmin ||
  mongoose.model<IPlatformAdmin>('PlatformAdmin', schema);
export default PlatformAdmin;
