interface CategoryOrder {
  _id: unknown;
}

interface MenuItemOrder {
  _id: unknown;
  categoryId: string;
  name: string;
  sortOrder?: number;
}

/** Keeps the menu in category order, then numeric item priority, preserving creation order for legacy records with equal positions. */
export default function sortMenuItems<T extends MenuItemOrder>(items: T[], categories: CategoryOrder[]): T[] {
  const categoryOrder = new Map(categories.map((category, index) => [String(category._id), index] as const));

  return [...items].sort((a, b) => {
    const categoryDifference =
      (categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER) -
      (categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER);
    if (categoryDifference) return categoryDifference;

    const priorityDifference = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return priorityDifference || a.name.localeCompare(b.name) || String(a._id).localeCompare(String(b._id));
  });
}
