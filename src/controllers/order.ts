import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { ClientSession } from 'mongoose';
import Order, { type IOrder, type IOrderItem, type IOrderCustomer } from '../models/order';
import MenuItem, { type IMenuItem } from '../models/menu_item';
import AddonGroup, { type IAddonGroup } from '../models/addon_group';
import lookup from '../utils/lookup';
import { toObjectId } from '../utils/auth_users';
import Customer from '../models/customer';
import DailyCounter from '../models/daily_counter';
import Settings from '../models/settings';
import Table from '../models/table';
import logAudit from '../utils/audit';
import dayKey from '../utils/day_key';
import calcTotals from '../utils/calc_totals';
import onSale from '../utils/on_sale';
import runInTransaction from '../utils/transaction';
import normalizePhone from '../utils/normalize_phone';
import applyKhata from '../utils/khata';
import httpError from '../utils/http_error';
import resolveBranchId from '../utils/resolve_branch';
import printHeader from '../utils/print_header';
import queuePrintJobs from '../utils/queue_print_jobs';
import { hasPermission } from '../middlewares/permission_guard';
import { getTenantId } from '../middlewares/tenant_context';
import onOrderEvent from '../services/order_events';
import orderCancelSchema from '../validations/order_cancel';

type PaymentMethod = NonNullable<IOrder['paymentMethod']>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const auditActor = (c: Context) => ({ name: c.get('user')?.name, via: (c.get('via') ?? 'web') as 'web' | 'pos' });

async function taxRateFor(method: PaymentMethod | undefined): Promise<number> {
  if (!method) return 0;
  const settings = await Settings.findOne({});
  return settings?.taxByPaymentMethod?.[method] ?? 0;
}

/**
 * The customer's counters once an order is paid or put on khata: one more order, what they spent, what they had.
 * Khata orders also add to what they owe, with a ledger line, in the same atomic update.
 */
async function recordCustomerOrder(order: IOrder, byName: string | undefined, session?: ClientSession) {
  if (!order.customerId) return;
  const lastOrder = {
    items: order.items,
    type: order.type,
    paymentMethod: order.paymentMethod,
    total: order.total,
    area: order.area,
    address: order.address,
  };
  const now = new Date().toISOString();

  if (order.paymentStatus === 'khata') {
    await applyKhata({
      customerId: order.customerId,
      delta: order.total,
      type: 'order',
      orderToken: order.dailyToken,
      byName,
      session,
      alsoInc: { orderCount: 1, totalSpent: order.total },
    });
    await Customer.updateOne({ _id: order.customerId }, { $set: { lastOrderAt: now, lastOrder } }, { session });
  } else if (order.paymentStatus === 'paid') {
    await Customer.updateOne(
      { _id: order.customerId },
      { $inc: { orderCount: 1, totalSpent: order.total }, $set: { lastOrderAt: now, lastOrder } },
      { session }
    );
  }
}

export async function listOrders(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  const date = c.req.query('date') || dayKey();
  const status = c.req.query('status');
  const customerId = c.req.query('customerId');

  if (!DAY.test(date)) return c.json({ message: 'Use a date like 2026-01-31' }, 400);

  const filter: Record<string, unknown> = {};
  if (branchId) filter.branchId = branchId;
  if (status) filter.status = String(status);

  if (customerId) {
    // A customer's history: every date.
    filter.customerId = String(customerId);
  } else if (c.req.query('allDates') !== 'true') {
    filter.dayKey = date;
  }

  const orders = await Order.find(filter).sort({ createdAt: -1 }).limit(500);
  return c.json(orders);
}

/** How long one stream stays open. The app reconnects, so sign-outs and locked terminals are checked again. */
const STREAM_MS = 5 * 60_000;

/**
 * Orders created or changed from now on, as Server-Sent Events: `order.created` and `order.updated`, each with the order
 * as GET /orders answers it. Scoped like GET /orders. After a reconnect the app loads /orders again for what it missed.
 * People who see the tables also get the guests' calls: `call.created` and `call.updated` (resolved once seen to).
 */
export async function streamOrders(c: Context) {
  const restaurantId = c.get('restaurantId') as string;
  const branchId = c.get('branchId') as string | undefined;
  const calls = await hasPermission(c, 'tables:view');
  // Bun closes a connection that is quiet for 10 seconds; this one is meant to wait. The pings find dead connections.
  (c.env as { timeout?: (req: Request, seconds: number) => void } | undefined)?.timeout?.(c.req.raw, 0);
  c.header('X-Accel-Buffering', 'no');

  const res = streamSSE(c, async (stream) => {
    const off = onOrderEvent({
      restaurantId,
      branchId,
      calls,
      send: ({ type, data }) => void stream.writeSSE({ event: type, data: JSON.stringify(data) }),
    });
    const ping = setInterval(() => void stream.write(': ping\n\n'), 25_000);
    // Open until the app goes away or the time is up.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STREAM_MS);
      stream.onAbort(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    clearInterval(ping);
    off();
  });
  // A proxy in front (Caddy's encode, nginx's gzip) must pass each event on as it comes, not hold it to compress.
  res.headers.set('Cache-Control', 'no-cache, no-transform');
  return res;
}

export async function getOrder(c: Context) {
  const order = await Order.findById(c.req.param('id')).catch(() => null);
  if (!order) {
    return c.json({ message: 'Order not found' }, 404);
  }
  return c.json(order);
}

/** When an order taken offline was really placed: its own time if believable (the last two days, not ahead), else now. */
function placedTime(placedAt?: string): number {
  const at = placedAt ? Date.parse(placedAt) : NaN;
  const now = Date.now();
  return at > now - 2 * 86_400_000 && at < now + 5 * 60_000 ? at : now;
}

type RawItem = { itemId: string; sizeId?: string | null; addonIds: string[]; note?: string | null; qty: number };

/**
 * The order's customer: an existing one by id, or a new record when a name and a real mobile number were given (a name
 * alone is a walk-in, with no record). Answers an error message when the id is unknown.
 */
async function resolveCustomer(body: { customerId?: string | null; newName?: string | null; newPhone?: string | null; area?: string | null; address?: string | null }) {
  if (body.customerId) {
    const cust = await Customer.findById(body.customerId).catch(() => null);
    if (!cust) return 'That customer was not found';
    const customerId = String(cust._id);
    return { customerId, customerSnapshot: { _id: customerId, name: cust.name, phone: cust.phone } as IOrderCustomer };
  }
  const phone = body.newName ? normalizePhone(body.newPhone || '') : null;
  // A name without a number is just a walk-in: no customer record (one fake number would merge every walk-in).
  if (!phone) return { customerId: undefined, customerSnapshot: undefined };
  const cust =
    (await Customer.findOne({ phone })) ??
    (await Customer.create({ name: body.newName ?? '', phone, area: body.area || undefined, addresses: body.address ? [body.address] : [], source: 'staff' }));
  const customerId = String(cust._id);
  return { customerId, customerSnapshot: { _id: customerId, name: cust.name, phone: cust.phone } as IOrderCustomer };
}

/**
 * The order lines priced from the menu, never from the client: size and add-ons by id, each checked against the dish's
 * add-on rules. The ids are kept on the line so the order can be opened for editing later. A deal is sold at its own
 * price and carries the dishes in it; it is sold out when any of them is. Dishes and deals sold only on some days or
 * hours must be on sale `at` (when the order was taken), except those already on the order being edited (`onOrder`).
 * Answers an error message when a dish is gone, sold out, not on sale or picked wrongly.
 */
export async function priceItems(rawItems: RawItem[], branchId: string, at: number = Date.now(), onOrder: string[] = []): Promise<IOrderItem[] | string> {
  // One aggregation: the dishes with their add-on groups and, for deals, the dishes in them (of the same restaurant).
  const ids = rawItems.map((item) => toObjectId(item.itemId)).filter((id) => id !== null);
  const sameRestaurant = { $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } };
  const menuItems = await MenuItem.aggregate<
    IMenuItem & { _id: unknown; groups: (IAddonGroup & { _id: unknown })[]; parts: (Pick<IMenuItem, 'name' | 'sizes' | 'soldOutBranchIds'> & { _id: unknown })[] }
  >([
    { $match: { _id: { $in: ids } } },
    ...lookup({ from: AddonGroup, localField: 'addonGroupIds', as: 'groups', let: { rid: '$restaurantId' }, pipeline: [sameRestaurant] }),
    ...lookup({
      from: MenuItem,
      localField: 'includes.itemId',
      as: 'parts',
      let: { rid: '$restaurantId' },
      pipeline: [sameRestaurant, { $project: { name: 1, sizes: 1, soldOutBranchIds: 1 } }],
    }),
  ]);
  const menuById = new Map(menuItems.map((m) => [String(m._id), m]));
  const priced: IOrderItem[] = [];

  for (const rawItem of rawItems) {
    const menuItem = menuById.get(rawItem.itemId);
    if (!menuItem || menuItem.hidden) return 'One of the dishes is no longer on the menu';
    if (menuItem.soldOutBranchIds.includes(branchId)) return `"${menuItem.name}" is sold out in this branch`;
    if (!onOrder.includes(rawItem.itemId) && !onSale(menuItem, at)) return `"${menuItem.name}" is not on sale right now`;

    const includes: NonNullable<IOrderItem['includes']> = [];
    for (const part of menuItem.includes ?? []) {
      const dish = menuItem.parts.find((entry) => String(entry._id) === part.itemId);
      if (!dish) return `A dish in "${menuItem.name}" is no longer on the menu`;
      if (dish.soldOutBranchIds.includes(branchId)) return `"${dish.name}" in "${menuItem.name}" is sold out in this branch`;
      const partSize = part.sizeId ? dish.sizes.find((s) => String(s._id) === part.sizeId) : dish.sizes[0];
      includes.push({ name: dish.name, sizeName: partSize?.name || undefined, qty: part.qty });
    }

    const size = rawItem.sizeId ? menuItem.sizes.find((s) => String(s._id) === rawItem.sizeId) : menuItem.sizes[0];
    if (!size) return rawItem.sizeId ? `Size not found for "${menuItem.name}"` : `"${menuItem.name}" has no price yet`;

    const chosen = new Set(rawItem.addonIds);
    let addonsPrice = 0;
    const addons: { name: string; price: number }[] = [];
    const addonIds: string[] = [];
    // In the dish's own order of groups.
    for (const groupId of menuItem.addonGroupIds) {
      const group = menuItem.groups.find((entry) => String(entry._id) === groupId);
      if (!group) continue;
      const picked = group.options.filter((o) => chosen.has(String(o._id)));
      if (picked.length < group.min) return `"${group.name}" for "${menuItem.name}" requires at least ${group.min} selection(s)`;
      if (picked.length > group.max) return `"${group.name}" for "${menuItem.name}" allows at most ${group.max} selection(s)`;
      for (const option of picked) {
        addonsPrice += option.price;
        addons.push({ name: option.name, price: option.price });
        addonIds.push(String(option._id));
      }
    }

    priced.push({
      itemId: String(menuItem._id),
      name: menuItem.name,
      sizeId: String(size._id),
      sizeName: size.name || undefined,
      addonIds: addonIds.length ? addonIds : undefined,
      addons: addons.length ? addons : undefined,
      includes: includes.length ? includes : undefined,
      note: rawItem.note || undefined,
      price: size.price + addonsPrice,
      qty: rawItem.qty,
    });
  }
  return priced;
}

export async function createOrder(c: Context) {
  const body = c.get('validatedJson');

  // Sent before (an offline order syncing again, or a retry after a dropped answer): the same order, not a second one.
  if (body.clientId) {
    const existing = await Order.findOne({ clientId: body.clientId });
    if (existing) return c.json(existing, 200);
  }
  const user = c.get('user');
  const branchId = await resolveBranchId(c, body.branchId);

  // What the person may do beyond taking the order.
  if (body.discount > 0 && !(await hasPermission(c, 'orders:discount'))) {
    return c.json({ message: 'You cannot give discounts' }, 403);
  }
  if (body.paymentStatus !== 'unpaid' && !(await hasPermission(c, 'orders:payment'))) {
    return c.json({ message: 'You cannot record payments. Save it as pay later.' }, 403);
  }

  // 1. The customer: an existing one, or a new one when a real mobile number was given.
  const found = await resolveCustomer(body);
  if (typeof found === 'string') return c.json({ message: found }, 400);
  const { customerId, customerSnapshot } = found;
  if (body.paymentStatus === 'khata' && !customerId) {
    return c.json({ message: 'Khata needs a saved customer with a mobile number' }, 400);
  }

  // 2. The table's name at the time of the order.
  let tableName = body.tableName || undefined;
  let tableId: string | undefined;
  if (body.tableId) {
    const table = await Table.findOne({ _id: body.tableId, branchId, archived: false }).catch(() => null);
    if (!table) return c.json({ message: 'That table is not in this branch' }, 400);
    tableId = String(table._id);
    tableName = table.name;
  }

  // 3. Prices come from the menu, never from the client. A deal taken offline counts at the time it was taken.
  const orderItems = await priceItems(body.items, branchId, placedTime(body.placedAt));
  if (typeof orderItems === 'string') return c.json({ message: orderItems }, 400);

  // 4. Totals. Tax is added once a payment method is known.
  const paymentMethod: PaymentMethod | undefined = body.paymentStatus === 'unpaid' ? undefined : body.paymentMethod;
  const taxRate = await taxRateFor(paymentMethod);
  const deliveryFee = body.type === 'delivery' ? body.deliveryFee || 0 : 0;
  const totals = calcTotals(orderItems, body.discount || 0, taxRate, deliveryFee);
  // An order taken offline counts on the day it was taken.
  const placed = placedTime(body.placedAt);
  const todayKey = dayKey(placed);

  // 5. Token, order and customer counters together.
  const create = () => runInTransaction(async (session) => {
    const counter = await DailyCounter.findOneAndUpdate(
      { restaurantId: getTenantId(), branchId, dayKey: todayKey },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after', session }
    );

    const [saved] = await Order.create(
      [
        {
          dailyToken: counter?.seq || 1,
          branchId,
          customerId,
          customer: customerSnapshot,
          type: body.type,
          status: 'new',
          items: orderItems,
          subtotal: totals.subtotal,
          discount: totals.discount,
          taxRate,
          tax: totals.tax,
          deliveryFee,
          total: totals.total,
          paymentMethod,
          paymentStatus: body.paymentStatus,
          tableId,
          tableName,
          area: body.area || undefined,
          address: body.address || undefined,
          rider: body.rider || undefined,
          takenBy: user?.name,
          dayKey: todayKey,
          clientId: body.clientId,
          placedAt: body.placedAt ? new Date(placed).toISOString() : undefined,
        },
      ],
      { session }
    );

    await recordCustomerOrder(saved!, user?.name, session);
    return saved!;
  });
  let newOrder: Awaited<ReturnType<typeof create>>;
  try {
    newOrder = await create();
  } catch (err) {
    // The same order arrived twice at once (two syncs racing): the first one saved it.
    const existing = body.clientId && (err as { code?: number }).code === 11000 ? await Order.findOne({ clientId: body.clientId }) : null;
    if (existing) return c.json(existing, 200);
    throw err;
  }

  await logAudit({
    action: 'order.created',
    actor: auditActor(c),
    target: { type: 'order', id: String(newOrder._id), label: `#${newOrder.dailyToken} (${newOrder.type})` },
    changes: { after: { total: newOrder.total, status: newOrder.status, dailyToken: newOrder.dailyToken } },
  });

  // The kitchen slips print by themselves. An order that is saved must not fail because a printer could not be reached.
  await queuePrintJobs(newOrder, 'kitchen', printHeader(c), true).catch((err) => console.error('[Print] Queueing kitchen slips failed:', err));

  return c.json(newOrder, 201);
}

/** Moves an order along the board. Cancelling has its own route and permission. */
async function setStatus(c: Context, id: string, status: IOrder['status']) {
  if (status === 'cancelled') throw httpError(400, 'Use Cancel order for that');
  // Only a guest's order from the table starts as pending; accepting it moves it to new, and it never goes back.
  if (status === 'pending') throw httpError(400, 'An order cannot go back to waiting for acceptance');
  const order = await Order.findOneAndUpdate(
    { _id: id, status: { $ne: 'cancelled' } },
    { $set: { status } },
    { returnDocument: 'before' }
  ).catch(() => null);
  if (!order) throw httpError(404, 'Order not found or already cancelled');

  await logAudit({
    action: 'order.status_updated',
    actor: auditActor(c),
    target: { type: 'order', id, label: `#${order.dailyToken}` },
    changes: { before: { status: order.status }, after: { status } },
  });
  const updated = await Order.findById(id);
  // A guest's order is printed for the kitchen once the staff accept it.
  if (updated && order.status === 'pending' && status === 'new') {
    await queuePrintJobs(updated, 'kitchen', printHeader(c), true).catch((err) => console.error('[Print] Queueing kitchen slips failed:', err));
  }
  return updated;
}

export async function updateOrderStatus(c: Context) {
  const { status } = c.get('validatedJson') as { status: IOrder['status'] };
  return c.json(await setStatus(c, c.req.param('id') ?? '', status));
}

export async function recordPayment(c: Context) {
  const id = c.req.param('id') ?? '';
  const { paymentMethod, paymentStatus = 'paid', discount, deliveryFee } = c.get('validatedJson') as {
    paymentMethod: PaymentMethod;
    paymentStatus?: 'paid' | 'khata';
    discount?: number;
    deliveryFee?: number;
  };
  const user = c.get('user');

  const order = await Order.findById(id).catch(() => null);
  if (!order) {
    return c.json({ message: 'Order not found' }, 404);
  }
  if (order.status === 'cancelled') {
    return c.json({ message: 'A cancelled order cannot be paid' }, 400);
  }
  if (order.status === 'pending') {
    return c.json({ message: 'Accept the order from the table first' }, 400);
  }
  if (order.paymentStatus !== 'unpaid') {
    return c.json({ message: `Order #${order.dailyToken} is already ${order.paymentStatus === 'paid' ? 'paid' : 'on khata'}` }, 409);
  }
  if (paymentStatus === 'khata' && !order.customerId) {
    return c.json({ message: 'Khata needs a saved customer on the order' }, 400);
  }
  if (discount !== undefined && discount !== order.discount && !(await hasPermission(c, 'orders:discount'))) {
    return c.json({ message: 'You cannot give discounts' }, 403);
  }

  const taxRate = await taxRateFor(paymentMethod);
  const appliedDelivery = order.type === 'delivery' ? (deliveryFee ?? order.deliveryFee) : 0;
  const totals = calcTotals(order.items, discount ?? order.discount, taxRate, appliedDelivery);

  const updated = await runInTransaction(async (session) => {
    // Only an unpaid order can be paid, checked in the same write, so a double tap cannot charge twice.
    const paid = await Order.findOneAndUpdate(
      { _id: id, paymentStatus: 'unpaid', status: { $ne: 'cancelled' } },
      {
        $set: {
          paymentMethod,
          paymentStatus,
          discount: totals.discount,
          deliveryFee: appliedDelivery,
          taxRate,
          tax: totals.tax,
          total: totals.total,
        },
      },
      { returnDocument: 'after', session }
    );
    if (!paid) throw httpError(409, 'This order was just paid by someone else');
    await recordCustomerOrder(paid, user?.name, session);
    return paid;
  });

  await logAudit({
    action: 'order.payment_recorded',
    actor: auditActor(c),
    target: { type: 'order', id, label: `#${order.dailyToken}` },
    changes: { after: { paymentMethod, paymentStatus, total: updated.total } },
  });

  return c.json(updated);
}

export async function updateOrder(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = { ...(c.get('validatedJson') as Record<string, unknown>) };

  const order = await Order.findById(id).catch(() => null);
  if (!order) {
    return c.json({ message: 'Order not found' }, 404);
  }

  // The board sends `{ status }` here.
  if (body.status !== undefined) {
    const { status, ...rest } = body;
    if (Object.keys(rest).length === 0) return c.json(await setStatus(c, id, status as IOrder['status']));
    await setStatus(c, id, status as IOrder['status']);
    delete body.status;
  }

  if (body.discount !== undefined || body.deliveryFee !== undefined) {
    if (order.paymentStatus !== 'unpaid') {
      return c.json({ message: 'The bill is settled; its amounts can no longer change' }, 400);
    }
    if (body.discount !== undefined && body.discount !== order.discount && !(await hasPermission(c, 'orders:discount'))) {
      return c.json({ message: 'You cannot give discounts' }, 403);
    }
    const discount = (body.discount as number | undefined) ?? order.discount;
    const deliveryFee = order.type === 'delivery' ? ((body.deliveryFee as number | undefined) ?? order.deliveryFee) : 0;
    const totals = calcTotals(order.items, discount, order.taxRate, deliveryFee);
    Object.assign(body, { discount: totals.discount, deliveryFee, tax: totals.tax, total: totals.total });
  }

  if (body.tableId) {
    const table = await Table.findOne({ _id: body.tableId, branchId: order.branchId, archived: false }).catch(() => null);
    if (!table) return c.json({ message: 'That table is not in this branch' }, 400);
    body.tableName = table.name;
  }

  const updated = await Order.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });

  await logAudit({
    action: 'order.updated',
    actor: auditActor(c),
    target: { type: 'order', id, label: `#${order.dailyToken}` },
  });

  return c.json(updated);
}

/** Statuses an order can still be edited in: until it is on the way or done. A guest's order can be fixed before accepting it. */
const EDITABLE_STATUSES: IOrder['status'][] = ['pending', 'new', 'preparing', 'ready'];

/**
 * Changes what a placed order is and what is in it (dishes, type, table, customer, discount), priced again from the menu.
 * Only until it is on the way or done, and only while unpaid: a paid or khata bill is settled.
 */
export async function editOrder(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');

  const order = await Order.findById(id).catch(() => null);
  if (!order) return c.json({ message: 'Order not found' }, 404);
  if (!EDITABLE_STATUSES.includes(order.status)) {
    return c.json({ message: 'This order is on the way or done, so it can no longer be changed' }, 400);
  }
  if (order.paymentStatus !== 'unpaid') {
    return c.json({ message: 'This bill is settled, so its order can no longer be changed' }, 400);
  }
  if (body.discount !== order.discount && body.discount > 0 && !(await hasPermission(c, 'orders:discount'))) {
    return c.json({ message: 'You cannot give discounts' }, 403);
  }

  const found = await resolveCustomer(body);
  if (typeof found === 'string') return c.json({ message: found }, 400);

  let tableName = body.type === 'dine_in' ? body.tableName || undefined : undefined;
  let tableId: string | undefined;
  if (body.type === 'dine_in' && body.tableId) {
    const table = await Table.findOne({ _id: body.tableId, branchId: order.branchId, archived: false }).catch(() => null);
    if (!table) return c.json({ message: 'That table is not in this branch' }, 400);
    tableId = String(table._id);
    tableName = table.name;
  }

  // Lines already on the order stay, even once their deal's hours are over.
  const items = await priceItems(body.items, order.branchId, Date.now(), order.items.map((item) => item.itemId));
  if (typeof items === 'string') return c.json({ message: items }, 400);

  // Unpaid, so no tax yet: it is added when the customer pays.
  const deliveryFee = body.type === 'delivery' ? body.deliveryFee || 0 : 0;
  const totals = calcTotals(items, body.discount || 0, 0, deliveryFee);
  const isDelivery = body.type === 'delivery';

  const updated = await Order.findByIdAndUpdate(
    id,
    {
      $set: {
        customerId: found.customerId,
        customer: found.customerSnapshot,
        type: body.type,
        items,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxRate: 0,
        tax: totals.tax,
        deliveryFee,
        total: totals.total,
        tableId,
        tableName,
        area: isDelivery ? body.area || undefined : undefined,
        address: isDelivery ? body.address || undefined : undefined,
        rider: isDelivery ? body.rider || undefined : undefined,
      },
    },
    { returnDocument: 'after' }
  );

  await logAudit({
    action: 'order.edited',
    actor: auditActor(c),
    target: { type: 'order', id, label: `#${order.dailyToken}` },
  });

  return c.json(updated);
}

/** Cancels an order (or turns down a guest's), saving who did it, when and why. */
export async function cancelOrder(c: Context) {
  const id = c.req.param('id') ?? '';
  const user = c.get('user');
  // Apps from before cancel reasons send no body at all.
  const parsed = orderCancelSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ message: parsed.error.issues[0]?.message ?? 'Invalid input', issues: parsed.error.issues }, 400);
  const { reason, note } = parsed.data;
  const cancellation = { reason, note: note || undefined, byName: user?.name, at: new Date() };

  const cancelled = await runInTransaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: id, status: { $ne: 'cancelled' } },
      { $set: { status: 'cancelled', cancellation } },
      { returnDocument: 'after', session }
    ).catch(() => null);
    if (!order) throw httpError(404, 'Order not found or already cancelled');

    // Undo what the order did to the customer. A khata order stops being owed, with a reversal line.
    if (order.customerId && order.paymentStatus === 'khata') {
      await applyKhata({
        customerId: order.customerId,
        delta: -order.total,
        type: 'reversal',
        orderToken: order.dailyToken,
        note: `Order #${order.dailyToken} cancelled`,
        byName: user?.name,
        session,
        alsoInc: { orderCount: -1, totalSpent: -order.total },
      });
    } else if (order.customerId && order.paymentStatus === 'paid') {
      await Customer.updateOne({ _id: order.customerId }, { $inc: { orderCount: -1, totalSpent: -order.total } }, { session });
    }
    return order;
  });

  await logAudit({
    action: 'order.cancelled',
    actor: auditActor(c),
    target: { type: 'order', id, label: `#${cancelled.dailyToken}` },
    changes: reason ? { after: { reason, note } } : undefined,
  });

  return c.json(cancelled);
}

export default {
  list: listOrders,
  stream: streamOrders,
  get: getOrder,
  create: createOrder,
  updateStatus: updateOrderStatus,
  recordPayment,
  update: updateOrder,
  edit: editOrder,
  cancel: cancelOrder,
};
