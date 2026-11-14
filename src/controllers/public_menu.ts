import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import Table from '../models/table';
import Branch from '../models/branch';
import Restaurant from '../models/restaurant';
import MenuCategory from '../models/menu_category';
import AddonGroup from '../models/addon_group';
import MenuItem from '../models/menu_item';
import GuestRequest from '../models/guest_request';
import Customer from '../models/customer';
import Order from '../models/order';
import DailyCounter from '../models/daily_counter';
import { priceItems } from './order';
import calcTotals from '../utils/calc_totals';
import onSale from '../utils/on_sale';
import dayKey from '../utils/day_key';
import httpError from '../utils/http_error';
import runInTransaction from '../utils/transaction';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';
import onOrderEvent from '../services/order_events';
import notifyStaff from '../services/push';
import type TableOrder from '../../site/types/table_order';

export async function getPublicMenu(c: Context) {
  const menu = await findPublicMenu(codeOf(c));
  if (menu === 'no_table') return c.json({ message: 'Table not found or has been removed' }, 404);
  if (menu === 'closed') return c.json({ message: 'This restaurant is not taking orders here right now' }, 404);
  return c.json(menu);
}

export interface PublicOrderAddonLike {
  name: string;
  price?: number;
}

export interface PublicOrderItemLike {
  name: string;
  qty: number;
  price: number;
  sizeName?: string;
  addonNames?: string[];
  addons?: PublicOrderAddonLike[];
  note?: string;
}

export interface PublicOrderLike {
  _id?: unknown;
  dailyToken: number;
  status: TableOrder['status'];
  paymentStatus: TableOrder['paymentStatus'];
  items?: PublicOrderItemLike[];
  total: number;
  createdAt?: Date | string | number;
}

export function toPublicTableOrder(order: PublicOrderLike): TableOrder {
  return {
    _id: String(order._id ?? ''),
    dailyToken: order.dailyToken,
    status: order.status,
    paymentStatus: order.paymentStatus,
    items: (order.items || []).map((it): TableOrder['items'][number] => ({
      name: it.name,
      qty: it.qty,
      price: it.price,
      sizeName: it.sizeName || undefined,
      addonNames: it.addonNames || (Array.isArray(it.addons) ? it.addons.map((a) => a.name) : []),
      note: it.note || undefined,
    })),
    total: order.total,
    createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : String(order.createdAt ?? ''),
  };
}

/**
 * What a guest sees behind a table's QR code: the restaurant, the table and the menu, with ids an order sends back.
 * The API answers it, and the site renders it into the page (restora.live/t/:code) without a request.
 */
export async function findPublicMenu(code: string | undefined) {
  const table = await tableForCode(code);
  if (!table || !table.restaurantId) return 'no_table';

  const { restaurantId, branchId } = table;

  const [restaurant, branch, categories, addonGroups, items, orders] = await runWithTenant(
    restaurantId,
    async () => {
      const r = await runWithoutTenant(() => Restaurant.findById(restaurantId));
      const b = await Branch.findById(branchId);
      if (!r || !b || b.isActive === false) return [null, null, [], [], [], []] as const;
      const cats = await MenuCategory.find({}).sort({ sortOrder: 1 });
      const groups = await AddonGroup.find({}).sort({ createdAt: 1 });
      const rawItems = await MenuItem.find({}).sort({ createdAt: 1 });
      const today = dayKey();
      const tableId = String(table._id);
      const activeOrders = await Order.find({
        branchId,
        tableId,
        dayKey: today,
        status: { $ne: 'cancelled' },
        $or: [{ status: { $ne: 'completed' } }, { paymentStatus: { $ne: 'paid' } }],
      }).sort({ createdAt: 1 });

      return [r, b, cats, groups, rawItems, activeOrders];
    }
  );

  if (!restaurant || !branch) return 'closed';

  const publicItems = items.filter((item) => !item.hidden && item.includes.every((part) => {
    const dish = items.find((candidate) => String(candidate._id) === part.itemId);
    return Boolean(dish && !dish.hidden);
  }));

  // A component stays in the guest menu if it has a size of its own; hide it only when every size is already
  // bundled in a deal that guests can order now. E.g. keep the full karahi when a deal contains only half.
  const bundledSizes = new Set<string>();
  for (const deal of publicItems) {
    if (!deal.includes.length || !onSale(deal) || deal.soldOutBranchIds.includes(branchId)) continue;
    const parts = deal.includes.flatMap((part) => {
      const dish = publicItems.find((item) => String(item._id) === part.itemId);
      const size = part.sizeId
        ? dish?.sizes.find((candidate) => String(candidate._id) === part.sizeId)
        : dish?.sizes[0];
      return dish && !dish.soldOutBranchIds.includes(branchId) && size ? [{ dish, size }] : [];
    });
    if (parts.length !== deal.includes.length) continue;
    for (const { dish, size } of parts) bundledSizes.add(`${String(dish._id)}:${String(size._id)}`);
  }
  const visibleItems = publicItems.filter((item) =>
    item.includes.length > 0 || !item.sizes.length || !item.sizes.every((size) => bundledSizes.has(`${String(item._id)}:${String(size._id)}`))
  );

  return {
    restaurant: {
      name: restaurant.name || 'Restaurant',
      logo: restaurant.logo,
    },
    branch: {
      name: branch.name || 'Main Branch',
    },
    table: {
      name: table.name,
    },
    orders: orders.map(toPublicTableOrder),
    categories: categories.map((cat) => ({
      _id: String(cat._id),
      name: cat.name,
    })),
    addonGroups: addonGroups.map((g) => ({
      _id: String(g._id),
      name: g.name,
      min: g.min,
      max: g.max,
      // The ids are what a guest's order sends back.
      options: g.options.map((o) => ({
        _id: String(o._id),
        name: o.name,
        price: o.price,
      })),
    })),
    items: visibleItems.map((it) => {
        const parts = it.includes.map((part) => ({ part, dish: items.find((dish) => String(dish._id) === part.itemId) }));
        return {
          _id: String(it._id),
          categoryId: it.categoryId,
          name: it.name,
          description: it.description || undefined,
          photo: it.photo || undefined,
          photoSizes: it.photoSizes,
          sizes: it.sizes.map((s) => ({
            _id: String(s._id),
            name: s.name,
            price: s.price,
          })),
          addonGroupIds: it.addonGroupIds,
          // A deal: what is in it, by name. Hidden or sold-out component dishes make the deal unavailable.
          includes: parts.length
            ? parts.map(({ part, dish }) => ({ name: dish?.name ?? '', sizeName: dish?.sizes.find((s) => String(s._id) === part.sizeId)?.name || undefined, qty: part.qty }))
            : undefined,
          days: it.days.length ? it.days : undefined,
          from: it.from || undefined,
          to: it.to || undefined,
          onSale: onSale(it),
          soldOut: it.soldOutBranchIds.includes(branchId) || parts.some(({ dish }) => !dish || dish.soldOutBranchIds.includes(branchId)),
        };
      }),
  };
}

// `restaurant/table-key` (restora.live/t/ubaids-tandoor-house/t1-7k2m9q), or an older table's random code.
const CODE = /^[a-zA-Z0-9_-]{3,64}(\/[a-z0-9-]{3,64})?$/;

/** The code in the address: one part (/t/:code, older links) or two (/t/:restaurant/:table). */
const codeOf = (c: Context) => c.req.param('code') ?? `${c.req.param('restaurant')}/${c.req.param('table')}`;

/** The open (not archived) table behind a QR code, from any restaurant. Codes printed before a table got its current one open it too. */
async function tableForCode(code: string | undefined) {
  if (!code || !CODE.test(code)) return null;
  return runWithoutTenant(() => Table.findOne({ $or: [{ qrCode: code }, { oldCodes: code }], archived: false }));
}

export async function createGuestCall(c: Context) {
  const table = await tableForCode(codeOf(c));
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const { type } = c.get('validatedJson') as { type: 'waiter' | 'bill' };

  const { request, created } = await runWithTenant(table.restaurantId, async () => {
    // One open call per table and kind: tapping again does not flood the floor screen.
    const open = await GuestRequest.findOne({ tableId: String(table._id), type, resolved: false });
    if (open) return { request: open, created: false };
    const made = await GuestRequest.create({
      branchId: table.branchId,
      tableId: String(table._id),
      tableName: table.name,
      type,
      resolved: false,
    });
    return { request: made, created: true };
  });

  if (created) {
    const title = `Table ${table.name} ${type === 'bill' ? 'asks for the bill' : 'calls a waiter'}`;
    notifyStaff(table.restaurantId!, table.branchId, 'tables:view', { title, body: 'Tap to open Tables', screen: 'tables', tag: `call-${request._id}` }).catch((err) =>
      console.error('[Push] guest call alert failed:', err)
    );
  }

  return c.json({
    success: true,
    requestId: String(request._id),
    message: `${type === 'waiter' ? 'Staff' : 'Bill'} requested for table ${table.name}`,
  });
}

/** How many of a table's orders may wait for staff at once: a photographed QR cannot flood the board. */
const MAX_PENDING = 3;

/**
 * A guest's order from the table's QR page. It waits as `pending` until staff accept it (or cancel it), so nothing
 * reaches the kitchen unchecked. Prices come from the menu; tax is added when the bill is paid, as for any unpaid order.
 */
export async function placeGuestOrder(c: Context) {
  const table = await tableForCode(codeOf(c));
  if (!table || !table.restaurantId) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const { items, clientId } = c.get('validatedJson') as { items: Parameters<typeof priceItems>[0]; clientId?: string };
  const tableId = String(table._id);
  const today = dayKey();
  const restaurantId = table.restaurantId;
  const branchId = table.branchId;

  const { order, created } = await runWithTenant(restaurantId, async () => {
    if (clientId) {
      const sent = await Order.findOne({ branchId, tableId, dayKey: today, clientId });
      if (sent) return { order: sent, created: false };
    }

    const pendingCount = await Order.countDocuments({ branchId, tableId, dayKey: today, status: 'pending' });
    if (pendingCount >= MAX_PENDING) throw httpError(429, 'Your earlier orders are still waiting for the staff. Please call a waiter.');

    const priced = await priceItems(items, branchId);
    if (typeof priced === 'string') throw httpError(400, priced);
    const totals = calcTotals(priced, 0, 0, 0);

    const saved = await runInTransaction(async (session) => {
      const counter = await DailyCounter.findOneAndUpdate(
        { restaurantId, branchId, dayKey: today },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session }
      );
      const [saved] = await Order.create(
        [
          {
            dailyToken: counter?.seq || 1,
            branchId,
            type: 'dine_in',
            status: 'pending',
            items: priced,
            subtotal: totals.subtotal,
            discount: 0,
            taxRate: 0,
            tax: 0,
            deliveryFee: 0,
            total: totals.total,
            paymentStatus: 'unpaid',
            tableId,
            tableName: table.name,
            takenBy: 'Guest (table QR)',
            dayKey: today,
            clientId,
          },
        ],
        { session }
      );
      return saved!;
    });
    return { order: saved, created: true };
  });

  if (created) {
    const body = order.items.map((item) => `${item.qty}× ${item.name}`).join(', ');
    notifyStaff(restaurantId, branchId, 'orders:view', { title: `Table ${table.name} sent order #${order.dailyToken}`, body, screen: 'orders', tag: `order-${order._id}` }).catch((err) =>
      console.error('[Push] guest order alert failed:', err)
    );
  }

  return c.json(toPublicTableOrder(order), 201);
}

/** A guest agrees to WhatsApp offers: saved as a customer (or the existing one is marked as agreeing). */
export async function optIn(c: Context) {
  const table = await tableForCode(codeOf(c));
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const { name, phone } = c.get('validatedJson') as { name?: string; phone: string };
  const whatsappOptIn = { at: new Date().toISOString(), source: 'qr' };

  await runWithTenant(table.restaurantId, async () => {
    const existing = await Customer.findOne({ phone });
    if (existing) {
      existing.whatsappOptIn = whatsappOptIn;
      if (!existing.name && name) existing.name = name;
      await existing.save();
      return;
    }
    await Customer.create({ name: name || 'Guest', phone, source: 'qr', whatsappOptIn });
  });

  return c.json({ success: true });
}

export async function resolveGuestRequest(c: Context) {
  const id = c.req.param('id') ?? '';
  const request = await GuestRequest.findOneAndUpdate(
    { _id: id },
    { $set: { resolved: true } },
    { returnDocument: 'after' }
  );
  if (!request) {
    return c.json({ message: 'Request not found' }, 404);
  }
  return c.json({ success: true, message: 'Request resolved' });
}

export async function getTableOrders(c: Context) {
  const table = await tableForCode(codeOf(c));
  if (!table || !table.restaurantId) return c.json({ message: 'Table not found' }, 404);

  const restaurantId = table.restaurantId;
  const branchId = table.branchId;
  const orders = await runWithTenant(restaurantId, async () => {
    const today = dayKey();
    const tableId = String(table._id);
    const activeOrders = await Order.find({
      branchId,
      tableId,
      dayKey: today,
      status: { $ne: 'cancelled' },
      $or: [{ status: { $ne: 'completed' } }, { paymentStatus: { $ne: 'paid' } }],
    }).sort({ createdAt: 1 });
    return activeOrders.map(toPublicTableOrder);
  });

  return c.json(orders);
}

export async function streamTableOrders(c: Context) {
  const table = await tableForCode(codeOf(c));
  if (!table || !table.restaurantId) return c.json({ message: 'Table not found' }, 404);

  (c.env as { timeout?: (req: Request, seconds: number) => void } | undefined)?.timeout?.(c.req.raw, 0);
  c.header('X-Accel-Buffering', 'no');

  const restaurantId = table.restaurantId;
  const branchId = table.branchId;
  const tableId = String(table._id);
  const res = streamSSE(c, async (stream) => {
    const off = onOrderEvent({
      restaurantId,
      branchId,
      tableId,
      calls: false,
      send: ({ type, data }) => {
        if ('items' in data && data.tableId === tableId) {
          void stream.writeSSE({ event: type, data: JSON.stringify(toPublicTableOrder(data)) });
        }
      },
    });
    const ping = setInterval(() => void stream.write(': ping\n\n'), 25_000);
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5 * 60_000);
      stream.onAbort(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    clearInterval(ping);
    off();
  });
  res.headers.set('Cache-Control', 'no-cache, no-transform');
  return res;
}

export default {
  getMenu: getPublicMenu,
  getOrders: getTableOrders,
  stream: streamTableOrders,
  call: createGuestCall,
  order: placeGuestOrder,
  optIn,
  resolve: resolveGuestRequest,
};
