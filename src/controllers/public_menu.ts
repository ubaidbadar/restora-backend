import type { Context } from 'hono';
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
import dayKey from '../utils/day_key';
import httpError from '../utils/http_error';
import runInTransaction from '../utils/transaction';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';

export async function getPublicMenu(c: Context) {
  const table = await tableForCode(c.req.param('code'));

  if (!table) {
    return c.json({ message: 'Table not found or has been removed' }, 404);
  }

  const { restaurantId, branchId } = table;

  const [restaurant, branch, categories, addonGroups, items] = await runWithTenant(
    restaurantId,
    async () => {
      const r = await runWithoutTenant(() => Restaurant.findById(restaurantId));
      const b = await Branch.findById(branchId);
      if (!r || !b || b.isActive === false) return [null, null, [], [], []] as const;
      const cats = await MenuCategory.find({}).sort({ sortOrder: 1 });
      const groups = await AddonGroup.find({}).sort({ createdAt: 1 });
      const rawItems = await MenuItem.find({ hidden: false }).sort({ createdAt: 1 });

      return [r, b, cats, groups, rawItems];
    }
  );

  if (!restaurant || !branch) {
    return c.json({ message: 'This restaurant is not taking orders here right now' }, 404);
  }

  const publicCategories = categories.map((c) => ({
    _id: String(c._id),
    name: c.name,
  }));

  const publicAddonGroups = addonGroups.map((g) => ({
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
  }));

  const publicItems = items.map((it) => ({
    _id: String(it._id),
    categoryId: it.categoryId,
    name: it.name,
    description: it.description || undefined,
    photo: it.photo || undefined,
    sizes: it.sizes.map((s) => ({
      _id: String(s._id),
      name: s.name,
      price: s.price,
    })),
    addonGroupIds: it.addonGroupIds,
    soldOut: it.soldOutBranchIds.includes(branchId),
  }));

  return c.json({
    restaurant: {
      name: restaurant?.name || 'Restaurant',
      logo: restaurant?.logo,
    },
    branch: {
      name: branch?.name || 'Main Branch',
    },
    table: {
      name: table.name,
    },
    categories: publicCategories,
    addonGroups: publicAddonGroups,
    items: publicItems,
  });
}

const CODE = /^[a-zA-Z0-9_-]{3,64}$/;

/** The open (not archived) table behind a QR code, from any restaurant. */
async function tableForCode(code: string | undefined) {
  if (!code || !CODE.test(code)) return null;
  return runWithoutTenant(() => Table.findOne({ qrCode: code, archived: false }));
}

export async function createGuestCall(c: Context) {
  const table = await tableForCode(c.req.param('code'));
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const { type } = c.get('validatedJson') as { type: 'waiter' | 'bill' };

  const request = await runWithTenant(table.restaurantId, async () => {
    // One open call per table and kind: tapping again does not flood the floor screen.
    const open = await GuestRequest.findOne({ tableId: String(table._id), type, resolved: false });
    if (open) return open;
    return GuestRequest.create({
      branchId: table.branchId,
      tableId: String(table._id),
      tableName: table.name,
      type,
      resolved: false,
    });
  });

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
  const table = await tableForCode(c.req.param('code'));
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const { items, clientId } = c.get('validatedJson') as { items: Parameters<typeof priceItems>[0]; clientId?: string };
  const tableId = String(table._id);
  const today = dayKey();

  const order = await runWithTenant(table.restaurantId, async () => {
    // One query: the same order sent before (a retry), and how many of the table's orders still wait.
    const waiting = await Order.aggregate<{ _id: unknown; clientId?: string; dailyToken: number; status: string; total: number }>([
      { $match: { tableId, dayKey: today, $or: [{ status: 'pending' }, ...(clientId ? [{ clientId }] : [])] } },
      { $project: { clientId: 1, dailyToken: 1, status: 1, total: 1 } },
    ]);
    const sent = clientId && waiting.find((o) => o.clientId === clientId);
    if (sent) return sent;
    if (waiting.length >= MAX_PENDING) throw httpError(429, 'Your earlier orders are still waiting for the staff. Please call a waiter.');

    const priced = await priceItems(items, table.branchId);
    if (typeof priced === 'string') throw httpError(400, priced);
    const totals = calcTotals(priced, 0, 0, 0);

    return runInTransaction(async (session) => {
      const counter = await DailyCounter.findOneAndUpdate(
        { restaurantId: table.restaurantId, branchId: table.branchId, dayKey: today },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after', session }
      );
      const [saved] = await Order.create(
        [
          {
            dailyToken: counter?.seq || 1,
            branchId: table.branchId,
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
  });

  return c.json({ _id: String(order._id), dailyToken: order.dailyToken, status: order.status, total: order.total }, 201);
}

/** A guest agrees to WhatsApp offers: saved as a customer (or the existing one is marked as agreeing). */
export async function optIn(c: Context) {
  const table = await tableForCode(c.req.param('code'));
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

export default {
  getMenu: getPublicMenu,
  call: createGuestCall,
  order: placeGuestOrder,
  optIn,
  resolve: resolveGuestRequest,
};
