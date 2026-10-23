import mongoose, { Schema, type Document, type Model } from 'mongoose';
import tenantPlugin from './plugins/tenant_plugin';
import PhotoSizesSchema, { type IPhotoSizes } from './photo_sizes_schema';

export interface IMenuSize {
  _id: string;
  name: string;
  price: number;
}

export interface IMenuItem {
  _id?: string;
  restaurantId?: string;
  categoryId: string;
  name: string;
  description?: string;
  /** The large photo (1200px); older apps read only this. */
  photo?: string;
  /** Its smaller sizes and blurred preview; missing on photos saved before sizes existed until the upgrade worker runs. */
  photoSizes?: IPhotoSizes;
  sizes: IMenuSize[];
  addonGroupIds: string[];
  soldOutBranchIds: string[];
  hidden: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const MenuSizeSchema = new Schema(
  {
    name: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
  },
  {
    _id: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        if (ret._id) ret._id = String(ret._id);
        return ret;
      },
    },
  }
);

const MenuItemSchema = new Schema<IMenuItem>(
  {
    categoryId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    photo: { type: String },
    photoSizes: { type: PhotoSizesSchema },
    sizes: { type: [MenuSizeSchema], default: [] },
    addonGroupIds: { type: [String], default: [] },
    soldOutBranchIds: { type: [String], default: [] },
    hidden: { type: Boolean, default: false },
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

MenuItemSchema.plugin(tenantPlugin);
MenuItemSchema.index({ restaurantId: 1, categoryId: 1 });

const MenuItem: Model<IMenuItem> = mongoose.models.MenuItem || mongoose.model<IMenuItem>('MenuItem', MenuItemSchema);

export default MenuItem;
