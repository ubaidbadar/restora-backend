import mongoose, { Schema, type Model } from 'mongoose';

/** Immutable append-only platform-privilege changes, separate from restaurant audit history. */
export interface IPlatformAuditEntry {
  action: 'platform.team_access_changed';
  actorUserId: string;
  targetUserId: string;
  before?: { role?: string; enabled?: boolean };
  after: { role: string; enabled: boolean };
  at: Date;
}
const schema = new Schema<IPlatformAuditEntry>({
  action: { type: String, enum: ['platform.team_access_changed'], required: true, index: true },
  actorUserId: { type: String, required: true },
  targetUserId: { type: String, required: true },
  before: { role: String, enabled: Boolean },
  after: { role: { type: String, required: true }, enabled: { type: Boolean, required: true } },
  at: { type: Date, default: Date.now, required: true, index: true },
}, { collection: 'platform_audit_entries', versionKey: false });
schema.index({ at: -1 });
const PlatformAuditEntry: Model<IPlatformAuditEntry> = mongoose.models.PlatformAuditEntry ||
  mongoose.model<IPlatformAuditEntry>('PlatformAuditEntry', schema);
export default PlatformAuditEntry;
