import type { Context } from 'hono';
import Table from '../models/table';
import Branch from '../models/branch';
import Restaurant from '../models/restaurant';
import MenuCategory from '../models/menu_category';
import AddonGroup from '../models/addon_group';
import MenuItem from '../models/menu_item';
import GuestRequest from '../models/guest_request';
import Customer from '../models/customer';
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
    options: g.options.map((o) => ({
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
  optIn,
  resolve: resolveGuestRequest,
};
