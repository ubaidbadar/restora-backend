import mongoose, { Schema, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IPrinter {
  /** The name Windows gives it; what the agent prints to. */
  systemName: string;
  /** What staff call it: Kitchen, Bar, Receipt… */
  label: string;
  prints: ('kitchen' | 'receipt')[];
  /** Kitchen slips only: just the dishes of these menu categories. Empty: every dish. */
  categoryIds: string[];
  /** Characters per line: 48 on an 80 mm roll, 32 on 58 mm. */
  width: 48 | 32;
  copies: number;
  /** False when Windows no longer lists it. */
  present: boolean;
  /** Set only when Windows chose the default printer automatically. */
  automatic?: boolean;
}

/** The app on a branch's PC that prints for the web app. */
export interface IPrintAgent {
  _id?: string;
  restaurantId?: string;
  name: string;
  branchId: string;
  /** SHA-256 of the agent's token, to find it with one indexed query. The token itself is never kept. */
  tokenLookup?: string;
  version?: string;
  lastSeenAt?: string;
  /** Until the agent pairs: the code typed into it. */
  pairing?: { code: string; expiresAt: string } | null;
  printers: IPrinter[];
  createdAt?: string;
  updatedAt?: string;
}

const PrinterSchema = new Schema<IPrinter>(
  {
    systemName: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    prints: { type: [String], enum: ['kitchen', 'receipt'], default: [] },
    categoryIds: { type: [String], default: [] },
    width: { type: Number, enum: [48, 32], default: 48 },
    copies: { type: Number, default: 1, min: 1, max: 5 },
    present: { type: Boolean, default: true },
    automatic: { type: Boolean, default: false },
  },
  { _id: false }
);

const hideSecrets = (_doc: unknown, ret: Record<string, unknown>) => {
  if (ret._id) ret._id = String(ret._id);
  delete ret.tokenLookup;
  delete ret.__v;
  return ret;
};

const PrintAgentSchema = new Schema<IPrintAgent>(
  {
    name: { type: String, required: true, trim: true },
    branchId: { type: String, required: true, index: true },
    tokenLookup: { type: String, unique: true, sparse: true },
    version: { type: String },
    lastSeenAt: { type: String },
    pairing: {
      type: new Schema({ code: { type: String, required: true }, expiresAt: { type: String, required: true } }, { _id: false }),
      default: null,
    },
    printers: { type: [PrinterSchema], default: [] },
  },
  { timestamps: true, toJSON: { virtuals: true, transform: hideSecrets }, toObject: { virtuals: true, transform: hideSecrets } }
);

PrintAgentSchema.plugin(tenantPlugin);
// A code finds its agent whichever restaurant it is in, so no two waiting agents share one.
PrintAgentSchema.index({ 'pairing.code': 1 }, { unique: true, partialFilterExpression: { 'pairing.code': { $type: 'string' } } });

const PrintAgent: Model<IPrintAgent> = mongoose.models.PrintAgent || mongoose.model<IPrintAgent>('PrintAgent', PrintAgentSchema);

export default PrintAgent;
