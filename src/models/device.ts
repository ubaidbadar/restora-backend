import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IDeviceActor {
  membershipId: string;
  name: string;
  /** Last request made by this actor; the server locks the terminal after `idleLockSeconds` without one. */
  lastActiveAt?: string;
}

export interface IDevice {
  _id?: string;
  restaurantId?: string;
  name: string;
  branchId: string;
  settings: {
    idleLockSeconds: number;
    lockAfterOrder: boolean;
  };
  tokenHash: string;
  /** SHA-256 of the token, to find the terminal with one indexed query. */
  tokenLookup?: string;
  actor?: IDeviceActor | null;
  pausedUntil?: string | null;
  consecutiveFailedPins?: number;
  lastSeenAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

const DeviceSchema = new Schema<IDevice>(
  {
    name: { type: String, required: true, trim: true },
    branchId: { type: String, required: true, index: true },
    settings: {
      idleLockSeconds: { type: Number, default: 90 },
      lockAfterOrder: { type: Boolean, default: false },
    },
    tokenHash: { type: String, required: true },
    tokenLookup: { type: String, unique: true, sparse: true },
    actor: {
      type: new Schema({ membershipId: String, name: String, lastActiveAt: String }, { _id: false }),
      default: null,
    },
    pausedUntil: { type: String, default: null },
    consecutiveFailedPins: { type: Number, default: 0 },
    lastSeenAt: { type: String },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.tokenHash;
        delete ret.tokenLookup;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        delete ret.tokenHash;
        delete ret.tokenLookup;
        delete ret.__v;
        return ret;
      },
    },
  }
);

DeviceSchema.plugin(tenantPlugin);
DeviceSchema.index({ restaurantId: 1, branchId: 1 });

const Device: Model<IDevice> = mongoose.models.Device || mongoose.model<IDevice>('Device', DeviceSchema);

export default Device;
