import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';

export interface IReservationCustomer {
  _id: string;
  name: string;
  phone: string;
}

export interface IReservation {
  _id?: string;
  restaurantId?: string;
  branchId: string;
  customerId: string;
  customer?: IReservationCustomer;
  partySize: number;
  dateTime: string;
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled';
  tableId?: string;
  note?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReservationCustomerSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
  },
  { _id: false }
);

const ReservationSchema = new Schema<IReservation>(
  {
    branchId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customer: { type: ReservationCustomerSchema },
    partySize: { type: Number, required: true, min: 1 },
    dateTime: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'seated', 'cancelled'],
      default: 'pending',
      index: true,
    },
    tableId: { type: String, index: true },
    note: { type: String, trim: true },
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

ReservationSchema.plugin(tenantPlugin);
ReservationSchema.index({ restaurantId: 1, branchId: 1, dateTime: 1 });

const Reservation: Model<IReservation> =
  mongoose.models.Reservation || mongoose.model<IReservation>('Reservation', ReservationSchema);

export default Reservation;
