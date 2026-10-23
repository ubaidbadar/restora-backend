import { Schema } from 'mongoose';

/** The smaller sizes of a saved photo (services/photo_variants), kept beside its large URL. */
export interface IPhotoSizes {
  /** 160px wide: list rows and thumbnails. */
  sm: string;
  /** 480px wide: cards and the guest menu. */
  md: string;
  /** The large photo's size, so pages keep its space before it loads. */
  width: number;
  height: number;
  /** A tiny blurred WebP data URL, shown while the photo loads. */
  blur: string;
}

const PhotoSizesSchema = new Schema<IPhotoSizes>(
  {
    sm: { type: String, required: true },
    md: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    blur: { type: String, required: true },
  },
  { _id: false }
);

export default PhotoSizesSchema;
