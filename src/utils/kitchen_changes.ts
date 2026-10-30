import type { IOrderItem } from '../models/order';

/** The same dish when it is the same item, size, add-ons and note. */
const lineKey = (item: IOrderItem) => [item.itemId, item.sizeId ?? '', [...(item.addonIds ?? [])].sort().join(','), item.note ?? ''].join('|');

/**
 * What the kitchen has to change when an order's dishes go from `before` to `after`: "CANCEL" for a dish taken off,
 * "LESS" for fewer of one, "ADD" for a new dish or more of one, each with the count that changed. The word is in the
 * name so every print agent, also one installed before this, prints it as is. Stopping cooking comes first.
 */
export default function kitchenChanges(before: IOrderItem[], after: IOrderItem[]): IOrderItem[] {
  const count = (items: IOrderItem[]) => {
    const lines = new Map<string, { item: IOrderItem; qty: number }>();
    // Plain copies: the order's lines may be Mongoose subdocuments.
    for (const item of JSON.parse(JSON.stringify(items)) as IOrderItem[]) {
      const line = lines.get(lineKey(item));
      if (line) line.qty += item.qty;
      else lines.set(lineKey(item), { item, qty: item.qty });
    }
    return lines;
  };
  const was = count(before);
  const now = count(after);

  const fewer: IOrderItem[] = [];
  const more: IOrderItem[] = [];
  for (const [key, { item, qty }] of was) {
    const left = now.get(key)?.qty ?? 0;
    if (left < qty) fewer.push({ ...item, qty: qty - left, name: `${left ? 'LESS' : 'CANCEL'} ${item.name}` });
  }
  for (const [key, { item, qty }] of now) {
    const had = was.get(key)?.qty ?? 0;
    if (qty > had) more.push({ ...item, qty: qty - had, name: `ADD ${item.name}` });
  }
  return [...fewer, ...more];
}
