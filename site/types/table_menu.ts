import type AddonGroup from './addon_group';
import type Dish from './dish';

/** What a guest sees after scanning a table's QR code (the same shape as `GET /api/v1/public/t/:code`). */
export default interface TableMenu {
  restaurant: { name: string; logo?: string };
  branch: { name: string };
  table: { name: string };
  categories: { _id: string; name: string }[];
  addonGroups: AddonGroup[];
  items: Dish[];
}
