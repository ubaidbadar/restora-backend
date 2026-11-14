import type { IOrder, IOrderItem } from '../models/order';

/** One dish whose count changed: 0 → 2 was added, 2 → 0 was removed. */
export interface LineChange {
  name: string;
  /** Size, add-ons and note, as on the receipt. */
  detail?: string;
  was: number;
  now: number;
}

/** The order's facts its history shows, as they read to a person. */
const FIELDS = ['type', 'tableName', 'customer', 'area', 'address', 'rider', 'discount', 'deliveryFee', 'serviceChargeType', 'serviceChargeValue', 'serviceCharge', 'total'] as const;
type Field = (typeof FIELDS)[number];
type Snapshot = Pick<IOrder, Exclude<Field, 'customer'>> & { customer?: { name?: string } | null };

/** The same dish when it is the same item, size, add-ons and note. */
const lineKey = (item: IOrderItem) => [item.itemId, item.sizeId ?? '', [...(item.addonIds ?? [])].sort().join(','), item.note ?? ''].join('|');

const lineDetail = (item: IOrderItem) =>
  [item.sizeName, item.addons?.map((addon) => addon.name).join(', '), item.note && `“${item.note}”`].filter(Boolean).join(' · ') || undefined;

/** Each dish whose count went up or down, removed ones first, in the order they appear on the order. */
export function lineChanges(before: IOrderItem[], after: IOrderItem[]): LineChange[] {
  const count = (items: IOrderItem[]) => {
    const lines = new Map<string, { item: IOrderItem; qty: number }>();
    for (const item of items) {
      const line = lines.get(lineKey(item));
      if (line) line.qty += item.qty;
      else lines.set(lineKey(item), { item, qty: item.qty });
    }
    return lines;
  };
  const was = count(before);
  const now = count(after);
  const changes: LineChange[] = [];
  for (const [key, { item, qty }] of was) {
    const left = now.get(key)?.qty ?? 0;
    if (left !== qty) changes.push({ name: item.name, detail: lineDetail(item), was: qty, now: left });
  }
  for (const [key, { item, qty }] of now) {
    if (!was.has(key)) changes.push({ name: item.name, detail: lineDetail(item), was: 0, now: qty });
  }
  return changes.sort((a, b) => Number(a.now > 0) - Number(b.now > 0));
}

const AMOUNTS: Field[] = ['discount', 'deliveryFee', 'serviceChargeValue', 'serviceCharge', 'total'];
const value = (order: Snapshot, field: Field) => {
  if (field === 'customer') return order.customer?.name || undefined;
  return AMOUNTS.includes(field) ? (order[field] ?? 0) : order[field] || undefined;
};

/**
 * What an edit changed, for the order's history: the dishes (`after.lines`) and each fact that changed, before and
 * after. Nothing when nothing changed.
 */
export default function orderChanges(before: Snapshot & { items?: IOrderItem[] }, after: Snapshot & { items?: IOrderItem[] }) {
  const was: Record<string, unknown> = {};
  const now: Record<string, unknown> = {};
  for (const field of FIELDS) {
    const a = value(before, field);
    const b = value(after, field);
    if (a !== b) {
      was[field] = a ?? null;
      now[field] = b ?? null;
    }
  }
  if (before.items && after.items) {
    const lines = lineChanges(before.items, after.items);
    if (lines.length) now.lines = lines;
  }
  return Object.keys(now).length ? { before: was, after: now } : undefined;
}
