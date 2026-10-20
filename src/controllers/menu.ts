import type { Context } from 'hono';
import MenuCategory from '../models/menu_category';
import AddonGroup from '../models/addon_group';
import MenuItem from '../models/menu_item';
import logAudit from '../utils/audit';
import storeImage from '../utils/store_image';
import httpError from '../utils/http_error';
import resolveBranchId from '../utils/resolve_branch';

/** The dish as the client shows it: `soldOut` for the given branch instead of the raw branch list. */
function dishJson(item: InstanceType<typeof MenuItem>, branchId?: string) {
  const obj = item.toJSON() as unknown as Record<string, unknown>;
  return {
    _id: obj._id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    photo: item.photo,
    sizes: obj.sizes,
    addonGroupIds: item.addonGroupIds,
    soldOut: branchId ? item.soldOutBranchIds.includes(branchId) : item.soldOutBranchIds.length > 0,
    hidden: item.hidden,
  };
}

/** The category and add-on groups a dish points to must exist in this restaurant. */
async function checkDishLinks(categoryId?: string, addonGroupIds?: string[]) {
  if (categoryId && !(await MenuCategory.exists({ _id: categoryId }).catch(() => null))) {
    throw httpError(400, 'Pick a category of this menu');
  }
  const ids = [...new Set(addonGroupIds ?? [])];
  if (ids.length && (await AddonGroup.countDocuments({ _id: { $in: ids } }).catch(() => -1)) !== ids.length) {
    throw httpError(400, 'One of the add-on groups does not exist');
  }
}

/** The whole menu as the client shows it, with `soldOut` for the given branch. */
async function menuJson(branchId?: string) {
  const [categories, addonGroups, rawItems] = await Promise.all([
    MenuCategory.find({}).sort({ sortOrder: 1 }),
    AddonGroup.find({}).sort({ createdAt: 1 }),
    MenuItem.find({}).sort({ createdAt: 1 }),
  ]);
  return { categories, addonGroups, items: rawItems.map((item) => dishJson(item, branchId)) };
}

export async function getMenu(c: Context) {
  return c.json(await menuJson(c.get('branchId') as string | undefined));
}

export async function createCategory(c: Context) {
  const body = c.get('validatedJson') || (await c.req.json());
  const category = await MenuCategory.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'menu_category.created',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'menu_category', id: String(category._id), label: category.name },
  });

  return c.json(category, 201);
}

export async function updateCategory(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson') || (await c.req.json());
  const category = await MenuCategory.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!category) return c.json({ message: 'Category not found' }, 404);
  return c.json(category);
}

export async function deleteCategory(c: Context) {
  const id = c.req.param('id') ?? '';
  const dishes = await MenuItem.countDocuments({ categoryId: id });
  if (dishes > 0) {
    return c.json({ message: `Move or delete its ${dishes} dish${dishes === 1 ? '' : 'es'} first` }, 400);
  }
  const category = await MenuCategory.findByIdAndDelete(id);
  if (!category) return c.json({ message: 'Category not found' }, 404);
  return c.json({ success: true, message: 'Category deleted' });
}

export async function createAddonGroup(c: Context) {
  const body = c.get('validatedJson') || (await c.req.json());
  const group = await AddonGroup.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'addon_group.created',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'addon_group', id: String(group._id), label: group.name },
  });

  return c.json(group, 201);
}

export async function updateAddonGroup(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');
  const group = await AddonGroup.findById(id);
  if (!group) return c.json({ message: 'Addon group not found' }, 404);

  group.set(body);
  if (group.min > group.max || group.min > group.options.length) {
    return c.json({ message: 'Pick at most as many as the most allowed and the options there are' }, 400);
  }
  await group.save();
  return c.json(group);
}

export async function deleteAddonGroup(c: Context) {
  const id = c.req.param('id') ?? '';
  const group = await AddonGroup.findByIdAndDelete(id);
  if (!group) return c.json({ message: 'Addon group not found' }, 404);
  // Dishes stop offering it.
  await MenuItem.updateMany({ addonGroupIds: id }, { $pull: { addonGroupIds: id } });
  return c.json({ success: true, message: 'Addon group deleted' });
}

export async function createMenuItem(c: Context) {
  const body = c.get('validatedJson');
  await checkDishLinks(body.categoryId, body.addonGroupIds);
  body.photo = (await storeImage(c, body.photo, 'dishes')) ?? undefined;

  const item = await MenuItem.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'menu_item.created',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'menu_item', id: String(item._id), label: item.name },
  });

  return c.json(dishJson(item, c.get('branchId')), 201);
}

export async function updateMenuItem(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');
  await checkDishLinks(body.categoryId, body.addonGroupIds);
  const photo = await storeImage(c, body.photo, 'dishes');
  if (photo !== undefined) body.photo = photo;

  const item = await MenuItem.findByIdAndUpdate(id, photo === null ? { $set: { ...body, photo: undefined }, $unset: { photo: 1 } } : { $set: body }, { returnDocument: 'after' });
  if (!item) return c.json({ message: 'Menu item not found' }, 404);
  return c.json(dishJson(item, c.get('branchId')));
}

export async function deleteMenuItem(c: Context) {
  const id = c.req.param('id') ?? '';
  const item = await MenuItem.findByIdAndDelete(id);
  if (!item) return c.json({ message: 'Menu item not found' }, 404);
  return c.json({ success: true, message: 'Menu item deleted' });
}

export async function toggleStock(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson') || (await c.req.json());
  const { soldOut, branchId: reqBranchId } = body as { soldOut: boolean; branchId?: string };
  const branchId = await resolveBranchId(c, reqBranchId);

  // Atomic add/remove, so two people toggling different dishes or branches cannot undo each other.
  const item = await MenuItem.findOneAndUpdate(
    { _id: id },
    soldOut ? { $addToSet: { soldOutBranchIds: branchId } } : { $pull: { soldOutBranchIds: branchId } },
    { returnDocument: 'after' }
  );
  if (!item) {
    return c.json({ message: 'Menu item not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'menu.stock_toggled',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'menu_item', id, label: `${item.name} (${soldOut ? 'Sold out' : 'In stock'})` },
  });

  return c.json(dishJson(item, branchId));
}

export async function bulkMenuImport(c: Context) {
  const body = c.get('validatedJson') || (await c.req.json());
  const { addonGroups, items } = body as {
    addonGroups: {
      name: string;
      min: number;
      max: number;
      options: { name: string; price: number }[];
    }[];
    items: {
      category: string;
      name: string;
      sizes: { name: string; price: number }[];
      addons?: string[];
    }[];
  };

  // 1. Create/upsert addon groups
  const addonGroupMap = new Map<string, string>();
  for (const group of addonGroups) {
    let existing = await AddonGroup.findOne({ name: group.name });
    if (!existing) {
      existing = await AddonGroup.create({
        name: group.name,
        min: group.min,
        max: group.max,
        options: group.options,
      });
    }
    addonGroupMap.set(group.name, String(existing._id));
  }

  // 2. Extract categories from items
  const categoryNames = Array.from(new Set(items.map((it) => it.category)));
  const categoryMap = new Map<string, string>();
  for (let i = 0; i < categoryNames.length; i++) {
    const catName = categoryNames[i]!;
    let cat = await MenuCategory.findOne({ name: catName });
    if (!cat) {
      cat = await MenuCategory.create({ name: catName, sortOrder: i });
    }
    categoryMap.set(catName, String(cat._id));
  }

  // 3. Create items
  for (const item of items) {
    const categoryId = categoryMap.get(item.category);
    if (!categoryId) continue;

    const addonGroupIds = (item.addons || [])
      .map((name) => addonGroupMap.get(name))
      .filter((id): id is string => !!id);

    await MenuItem.create({
      categoryId,
      name: item.name,
      sizes: item.sizes,
      addonGroupIds,
      soldOutBranchIds: [],
      hidden: false,
    });
  }

  const user = c.get('user');
  await logAudit({
    action: 'menu.bulk_imported',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'menu', label: `Imported ${items.length} dishes` },
  });

  // The whole menu after the import, so the screen shows it without asking again.
  return c.json(await menuJson(c.get('branchId') as string | undefined));
}

export default {
  getMenu,
  createCategory,
  updateCategory,
  deleteCategory,
  createAddonGroup,
  updateAddonGroup,
  deleteAddonGroup,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleStock,
  bulkMenuImport,
};
