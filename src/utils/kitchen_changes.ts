import type { IOrderItem } from '../models/order';

/** The same dish when it is the same item, size, add-ons and note. */
const lineKey = (item: IOrderItem) => [item.itemId, item.sizeId ?? '', [...(item.addonIds ?? [])].sort().join(','), item.note ?? ''].join('|');

/**
 * What the kitchen has to change when an order's dishes go from `before` to `after`. 4 burgers and 3 shawarmas made 1
 * burger: "4x CANCEL Burger", "3x CANCEL Shawarma", then "1x NEW Burger". The word is in the name so every print agent,
 * also one installed before this, prints it as is (thermal printers have no strike-through). Stopping cooking comes first.
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

  // A line whose count changed is cut whole (all it had) and printed again with its new count, so the cook reads the
  // count to make, never a sum. Lines that did not change are left off: the kitchen has them.
  const cut: IOrderItem[] = [];
  const fresh: IOrderItem[] = [];
  for (const [key, { item, qty }] of was) {
    if ((now.get(key)?.qty ?? 0) !== qty) cut.push({ ...item, qty, name: `CANCEL ${item.name}` });
  }
  for (const [key, { item, qty }] of now) {
    if ((was.get(key)?.qty ?? 0) !== qty) fresh.push({ ...item, qty, name: `NEW ${item.name}` });
  }
  return [...cut, ...fresh];
}
