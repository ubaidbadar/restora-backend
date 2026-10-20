import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IInvitation {
  _id?: string;
  restaurantId?: string;
  token: string;
  channel: 'email' | 'phone';
  email?: string;
  phone?: string;
  name?: string;
  roleIds: string[];
  branchScope: 'all' | 'list';
  branchIds: string[];
  status?: 'pending' | 'accepted' | 'revoked';
  expiresAt: string;
  invitedByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

const InvitationSchema = new Schema<IInvitation>(
  {
    token: { type: String, required: true, unique: true, index: true },
    channel: { type: String, enum: ['email', 'phone'], required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    name: { type: String, trim: true },
    roleIds: { type: [String], default: [] },
    branchScope: { type: String, enum: ['all', 'list'], default: 'all' },
    branchIds: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'accepted', 'revoked'], default: 'pending', index: true },
    expiresAt: { type: String, required: true },
    invitedByName: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        ret.expired = ret.expiresAt ? new Date() > new Date(ret.expiresAt as string) : false;
        // An email invitation's link only travels in the email; phone invitations are shared by hand, so they keep it.
        if (ret.channel === 'email') delete ret.token;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        ret.expired = ret.expiresAt ? new Date() > new Date(ret.expiresAt as string) : false;
        // An email invitation's link only travels in the email; phone invitations are shared by hand, so they keep it.
        if (ret.channel === 'email') delete ret.token;
        delete ret.__v;
        return ret;
      },
    },
  }
);

InvitationSchema.plugin(tenantPlugin);
InvitationSchema.index({ restaurantId: 1, status: 1 });
InvitationSchema.index({ email: 1, status: 1 });

const Invitation: Model<IInvitation> =
  mongoose.models.Invitation || mongoose.model<IInvitation>('Invitation', InvitationSchema);

export default Invitation;
