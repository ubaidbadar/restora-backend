import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface ITeam {
  _id?: string;
  restaurantId?: string;
  name: string;
  description?: string;
  branchId?: string;
  membershipIds: string[];
  archivedAt?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    branchId: { type: String, default: null },
    membershipIds: { type: [String], default: [] },
    archivedAt: { type: String },
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

TeamSchema.plugin(tenantPlugin);
TeamSchema.index({ restaurantId: 1, branchId: 1 });

const Team: Model<ITeam> = mongoose.models.Team || mongoose.model<ITeam>('Team', TeamSchema);

export default Team;
