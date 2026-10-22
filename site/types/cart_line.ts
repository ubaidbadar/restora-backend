/** One line of a guest's cart: a dish as picked (size, add-ons, note) and how many. */
export default interface CartLine {
  key: string;
  itemId: string;
  name: string;
  sizeId: string;
  sizeName?: string;
  addonIds: string[];
  addonNames: string[];
  note?: string;
  unitPrice: number;
  qty: number;
}
