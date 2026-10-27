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
  /** A deal: the dishes in it, for one deal. */
  includes?: { name: string; sizeName?: string; qty: number }[];
  /** Sold only on these days (0 is Sunday) and between these times; none is always. */
  days?: number[];
  from?: string;
  to?: string;
  /** Whether it is sold at this moment (its days and hours). */
  onSale: boolean;
  soldOut: boolean;
}
