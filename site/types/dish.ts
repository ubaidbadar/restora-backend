import type PhotoSizes from './photo_sizes';

/** A dish on a table's menu. */
export default interface Dish {
  _id: string;
  categoryId: string;
  name: string;
  description?: string;
  photo?: string;
  photoSizes?: PhotoSizes;
  sizes: { _id: string; name: string; price: number }[];
  addonGroupIds: string[];
  soldOut: boolean;
}
