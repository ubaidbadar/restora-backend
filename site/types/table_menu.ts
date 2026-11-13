import type AddonGroup from './addon_group';
import type Dish from './dish';
import type TableOrder from './table_order';

/** What a guest sees after scanning a table's QR code (the same shape as `GET /api/v1/public/t/:code`). */
export default interface TableMenu {
  restaurant: { name: string; logo?: string };
  branch: { name: string };
  table: { name: string };
  dineInServiceCharge: { enabled: boolean; type: 'percentage' | 'fixed'; value: number; taxable: boolean };
  orders: TableOrder[];
  categories: { _id: string; name: string }[];
  addonGroups: AddonGroup[];
  items: Dish[];
}
