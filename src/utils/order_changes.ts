import type { IOrder, IOrderItem } from '../models/order';

/** One dish whose count or unit price changed: 0 → 2 was added, 2 → 0 was removed. */
export interface LineChange {
  name: string;
  /** Size, add-ons and note, as on the receipt. */
  detail?: string;
  was: number;
  now: number;
  wasPrice?: number;
  nowPrice?: number;
}

/** The order's facts its history shows, as they read to a person. */
const FIELDS = ['type', 'tableName', 'customer', 'area', 'address', 'rider', 'discount', 'deliveryFee', 'serviceChargeType', 'serviceChargeValue', 'serviceCharge', 'total'] as const;
type Field = (typeof FIELDS)[number];
type Snapshot = Pick<IOrder, Exclude<Field, 'customer'>> & { customer?: { name?: string } | null };

/** The same dish when it is the same item, size, add-ons and note. */
const lineKey = (item: IOrderItem) => [item.itemId, item.sizeId ?? '', [...(item.addonIds ?? [])].sort().join(','), item.note ?? ''].join('|');
/** The priced selection, excluding a kitchen note which does not affect its unit price. */
const lineSelectionKey = (item: IOrderItem) => [item.itemId, item.sizeId ?? '', [...(item.addonIds ?? [])].sort().join(',')].join('|');

const lineDetail = (item: IOrderItem) =>
  [item.sizeName, item.addons?.map((addon) => addon.name).join(', '), item.note && `“${item.note}”`].filter(Boolean).join(' · ') || undefined;

/** Each dish whose count, price or kitchen note changed, removed ones first, in the order they appear on the order. */
export function lineChanges(before: IOrderItem[], after: IOrderItem[]): LineChange[] {
  const count = (items: IOrderItem[]) => {
    const lines = new Map<string, { item: IOrderItem; qty: number }>();
    for (const item of items) {
      const key = lineKey(item);
      const line = lines.get(key);
      if (line) line.qty += item.qty;
      else lines.set(key, { item, qty: item.qty });
    }
    return lines;
  };
  const was = count(before);
  const now = count(after);
  const matchedWas = new Set<string>();
  const matchedNow = new Set<string>();
  const changes: LineChange[] = [];

  const record = (previous: { item: IOrderItem; qty: number }, current: { item: IOrderItem; qty: number }) => {
    const priceChanged = previous.item.price !== current.item.price;
    const detailChanged = lineDetail(previous.item) !== lineDetail(current.item);
    if (previous.qty === current.qty && !priceChanged && !detailChanged) return;
    changes.push({
      name: current.item.name,
      detail: lineDetail(current.item),
      was: previous.qty,
      now: current.qty,
      ...(priceChanged ? { wasPrice: previous.item.price, nowPrice: current.item.price } : {}),
    });
  };

  // First match the exact dish, size, add-ons and note.
  for (const [key, previous] of was) {
    const current = now.get(key);
    if (!current) continue;
    matchedWas.add(key);
    matchedNow.add(key);
    record(previous, current);
  }

  // A changed kitchen note must not turn the same priced dish into a remove + add in history.
  const unmatchedBySelection = new Map<string, { key: string; item: IOrderItem; qty: number }[]>();
  for (const [key, previous] of was) {
    if (matchedWas.has(key)) continue;
    const selection = lineSelectionKey(previous.item);
    const candidates = unmatchedBySelection.get(selection);
    if (candidates) candidates.push({ key, ...previous });
    else unmatchedBySelection.set(selection, [{ key, ...previous }]);
  }

  for (const [key, current] of now) {
    if (matchedNow.has(key)) continue;
    const candidates = unmatchedBySelection.get(lineSelectionKey(current.item))?.filter((candidate) => !matchedWas.has(candidate.key)) ?? [];
    if (!candidates.length) continue;

    const samePrice = candidates.filter((candidate) => candidate.item.price === current.item.price);
    const sameQty = candidates.filter((candidate) => candidate.qty === current.qty);
    const previous = samePrice.length === 1
      ? samePrice[0]
      : candidates.length === 1
        ? candidates[0]
        : sameQty.length === 1 ? sameQty[0] : undefined;
    if (!previous) continue;

    matchedWas.add(previous.key);
    matchedNow.add(key);
    record(previous, current);
  }

  // Anything still unmatched is a real removal or addition.
  for (const [key, previous] of was) {
    if (!matchedWas.has(key)) {
      changes.push({ name: previous.item.name, detail: lineDetail(previous.item), was: previous.qty, now: 0 });
    }
  }
  for (const [key, current] of now) {
    if (!matchedNow.has(key)) {
      changes.push({
        name: current.item.name,
        detail: lineDetail(current.item),
        was: 0,
        now: current.qty,
        ...(current.item.priceOverridden ? { wasPrice: current.item.menuPrice ?? current.item.price, nowPrice: current.item.price } : {}),
      });
    }
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
