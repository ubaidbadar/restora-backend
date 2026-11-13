import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IStaffMember {
  _id?: string;
  restaurantId?: string;
  userId: string;
  roleIds: string[];
  branchScope: 'all' | 'list';
  branchIds: string[];
  status: 'active' | 'suspended';
  joinedAt?: string;
  hasPin?: boolean;
  pinHash?: string;
  failedPinAttempts?: number;
  pinLocked?: boolean;
  isOwner?: boolean;
  isPrimaryOwner?: boolean;
  preferences?: {
    orders?: {
      sidebarHidden?: boolean;
      detailsPanel?: boolean;
      density?: 'comfortable' | 'compact';
    };
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const StaffMemberSchema = new Schema<IStaffMember>(
  {
    userId: { type: String, required: true, index: true },
    roleIds: { type: [String], default: [] },
    branchScope: { type: String, enum: ['all', 'list'], default: 'all' },
    branchIds: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    joinedAt: { type: String, default: () => new Date().toISOString() },
    pinHash: { type: String },
    failedPinAttempts: { type: Number, default: 0 },
    pinLocked: { type: Boolean, default: false },
    isOwner: { type: Boolean, default: false },
    isPrimaryOwner: { type: Boolean, default: false },
    preferences: {
      orders: {
        sidebarHidden: { type: Boolean, default: false },
        detailsPanel: { type: Boolean, default: false },
        density: { type: String, enum: ['comfortable', 'compact'], default: 'comfortable' },
      },
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        ret.hasPin = !!ret.pinHash;
        delete ret.pinHash;
        delete ret.preferences;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        ret.hasPin = !!ret.pinHash;
        delete ret.pinHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

StaffMemberSchema.plugin(tenantPlugin);
StaffMemberSchema.index({ restaurantId: 1, userId: 1 }, { unique: true });

const StaffMember: Model<IStaffMember> =
  mongoose.models.StaffMember || mongoose.model<IStaffMember>('StaffMember', StaffMemberSchema);

export default StaffMember;
