import mongoose, { Schema, type Document, type Model } from 'mongoose';
import type { PaymentMethod } from '../constants/payment_methods';
import type { TemplateKey } from '../constants/template_keys';
import tenantPlugin from './plugins/tenant_plugin';

export interface ISettings {
  _id?: string;
  restaurantId?: string;
  restaurantName: string;
  logo?: string;
  onboarded?: boolean;
  taxSet?: boolean;
  taxByPaymentMethod?: Record<PaymentMethod, number>;
  dineInServiceCharge?: { enabled: boolean; type: 'percentage' | 'fixed'; value: number; taxable: boolean };
  whatsappTemplates?: Record<TemplateKey, string>;
  /** Printed on customer receipts; each line is left off while empty. */
  receipt?: { ntn?: string; strn?: string; footer?: string };
  /** The restaurant's theme, light or dark, and sidebar (see shared/restaurant_settings). */
  appearance?: { theme?: string; mode?: string; sidebar?: string };
  updatedAt?: string;
  createdAt?: string;
}

const DineInServiceChargeSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    type: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    value: { type: Number, min: 0, default: 0 },
    taxable: { type: Boolean, default: true },
  },
  { _id: false }
);

const SettingsSchema = new Schema<ISettings>(
  {
    restaurantId: { type: String, required: true, unique: true },
    restaurantName: { type: String, required: true, trim: true },
    logo: { type: String },
    onboarded: { type: Boolean, default: false },
    taxSet: { type: Boolean, default: false },
    taxByPaymentMethod: {
      cash: { type: Number, default: 16 },
      card: { type: Number, default: 5 },
      jazzcash: { type: Number, default: 5 },
      easypaisa: { type: Number, default: 5 },
      bank: { type: Number, default: 5 },
    },
    dineInServiceCharge: { type: DineInServiceChargeSchema, default: () => ({}) },
    receipt: {
      ntn: { type: String, trim: true },
      strn: { type: String, trim: true },
      footer: { type: String, trim: true },
    },
    appearance: {
      theme: { type: String, enum: ['indigo', 'saffron', 'emerald', 'ocean', 'bordeaux', 'onyx'], default: 'indigo' },
      mode: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
      sidebar: { type: String, enum: ['theme', 'plain'], default: 'plain' },
    },
    whatsappTemplates: {
      winback: {
        type: String,
        default: 'Assalam o Alaikum {name}! We miss you at {restaurant}. Order this week and get 10% off your karahi.',
      },
      reservation: {
        type: String,
        default: 'Hi {name}, your table for {party} at {restaurant} is booked for {date} at {time}. Reply YES to confirm.',
      },
    },
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

SettingsSchema.plugin(tenantPlugin);

const Settings: Model<ISettings> =
  mongoose.models.Settings || mongoose.model<ISettings>('Settings', SettingsSchema);

export default Settings;
