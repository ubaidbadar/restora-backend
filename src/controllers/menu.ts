import type { Context } from 'hono';
import MenuCategory from '../models/menu_category';
import AddonGroup from '../models/addon_group';
import MenuItem, { type IDealPart } from '../models/menu_item';
import logAudit from '../utils/audit';
import storePhoto from '../utils/store_photo';
import httpError from '../utils/http_error';
import resolveBranchId from '../utils/resolve_branch';
import { toObjectId } from '../utils/auth_users';
import { getTenantId } from '../middlewares/tenant_context';

/** The dish as the client shows it: `soldOut` for the given branch instead of the raw branch list. */
function dishJson(item: InstanceType<typeof MenuItem>, branchId?: string) {
  const obj = item.toJSON() as unknown as Record<string, unknown>;
  return {
    _id: obj._id,
    categoryId: item.categoryId,
    name: item.name,
    description: item.description,
    photo: item.photo,
    photoSizes: item.photoSizes,
    sizes: obj.sizes,
    addonGroupIds: item.addonGroupIds,
    includes: item.includes.map((part) => ({ itemId: part.itemId, sizeId: part.sizeId, qty: part.qty })),
    days: item.days,
    from: item.from,
    to: item.to,
    soldOut: branchId ? item.soldOutBranchIds.includes(branchId) : item.soldOutBranchIds.length > 0,
    hidden: item.hidden,
  };
}

/**
 * What a dish points to must exist in this restaurant: its category, its add-on groups and, for a deal, the dishes in it
 * with their sizes. A deal is made of plain dishes, so a deal cannot hold a deal, and a dish in a deal cannot become one.
 * One aggregation for all of it.
 */
async function checkDishLinks(body: { categoryId?: string; addonGroupIds?: string[]; includes?: IDealPart[] }, selfId?: string) {
  const restaurantId = getTenantId();
  const groupIds = [...new Set(body.addonGroupIds ?? [])];
  const parts = body.includes ?? [];
  const partIds = [...new Set(parts.map((part) => part.itemId))];
  if (selfId && partIds.includes(selfId)) throw httpError(400, 'A deal cannot hold itself');

  const found = await MenuCategory.aggregate<{ kind: 'category' | 'group' | 'dish' | 'holder'; _id: unknown; name?: string; sizes?: { _id: unknown }[]; includes?: IDealPart[] }>([
    { $match: { _id: toObjectId(body.categoryId ?? '') } },
    { $project: { kind: 'category' } },
    { $unionWith: { coll: AddonGroup.collection.collectionName, pipeline: [{ $match: { restaurantId, _id: { $in: groupIds.map(toObjectId) } } }, { $project: { kind: 'group' } }] } },
    { $unionWith: { coll: MenuItem.collection.collectionName, pipeline: [{ $match: { restaurantId, _id: { $in: partIds.map(toObjectId) } } }, { $project: { kind: 'dish', name: 1, sizes: 1, includes: 1 } }] } },
    // A deal holding this dish: then this dish cannot become a deal.
    ...(selfId && parts.length ? [{ $unionWith: { coll: MenuItem.collection.collectionName, pipeline: [{ $match: { restaurantId, 'includes.itemId': selfId } }, { $limit: 1 }, { $project: { kind: 'holder', name: 1 } }] } }] : []),
  ]);
  const of = (kind: string) => found.filter((doc) => doc.kind === kind);

  if (body.categoryId && !of('category').length) throw httpError(400, 'Pick a category of this menu');
  if (of('group').length !== groupIds.length) throw httpError(400, 'One of the add-on groups does not exist');
  const holder = of('holder')[0];
  if (holder) throw httpError(400, `This dish is in "${holder.name}", so it cannot be a deal itself`);
  const dishes = new Map(of('dish').map((dish) => [String(dish._id), dish]));
  for (const part of parts) {
    const dish = dishes.get(part.itemId);
    if (!dish) throw httpError(400, 'One of the dishes in the deal is not on the menu');
    if (dish.includes?.length) throw httpError(400, `"${dish.name}" is a deal itself`);
    if (part.sizeId && !dish.sizes?.some((size) => String(size._id) === part.sizeId)) throw httpError(400, `Pick a size of "${dish.name}"`);
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
    actor: { userId: user?.id, name: user?.name, via: 'web' },
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
    actor: { userId: user?.id, name: user?.name, via: 'web' },
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
  await checkDishLinks(body);
  const stored = await storePhoto(c, body.photo, 'dishes');
  delete body.photo;
  if (stored) {
    Object.assign(body, { photo: stored.photo, ...(stored.photoSizes && { photoSizes: stored.photoSizes }) });
  }

  const item = await MenuItem.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'menu_item.created',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'menu_item', id: String(item._id), label: item.name },
  });

  return c.json(dishJson(item, c.get('branchId')), 201);
}

export async function updateMenuItem(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');
  await checkDishLinks(body, id);
  const stored = await storePhoto(c, body.photo, 'dishes');
  delete body.photo;
  // A new photo sets both fields; clearing removes both. A URL sent back as it is (the apps never do) keeps its sizes.
  const update =
    stored === null
      ? { $set: body, $unset: { photo: 1, photoSizes: 1 } }
      : { $set: { ...body, ...(stored && { photo: stored.photo }), ...(stored?.photoSizes && { photoSizes: stored.photoSizes }) } };
  const item = await MenuItem.findByIdAndUpdate(id, update, { returnDocument: 'after' });
  if (!item) return c.json({ message: 'Menu item not found' }, 404);
  return c.json(dishJson(item, c.get('branchId')));
}

export async function deleteMenuItem(c: Context) {
  const id = c.req.param('id') ?? '';
  const deal = await MenuItem.findOne({ 'includes.itemId': id }, { name: 1 });
  if (deal) return c.json({ message: `Take it out of "${deal.name}" first` }, 400);
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
    actor: { userId: user?.id, name: user?.name, via: 'web' },
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
    actor: { userId: user?.id, name: user?.name, via: 'web' },
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
