import type AddonGroup from '../../types/addon_group';
import type Dish from '../../types/dish';
import formatRs from '../../utils/format_rs';
import AddToCart from './add_to_cart';
import Photo from '../../components/photo';
import saleHours from '../../utils/sale_hours';

/**
 * A dish as a guest reads it: name, what it is, its price (from the smallest size), a photo, and the way to add it. A deal
 * also lists what is in it, and one sold only at some hours says when.
 */
export default function DishCard({ dish, groups, priority = false }: { dish: Dish; groups: AddonGroup[]; priority?: boolean }) {
  const from = Math.min(...dish.sizes.map((size) => size.price));
  const orderable = !dish.soldOut && dish.onSale && dish.sizes.length > 0;
  const hours = saleHours(dish);

  return (
    <li className={`flex gap-3.5 rounded-panel bg-paper p-4 shadow-slip ${orderable ? '' : 'opacity-60'}`}>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="font-sans text-[1.05rem] font-semibold leading-snug text-ink">{dish.name}</h3>
        {dish.includes && (
          <p className="mt-1 text-[0.95rem] leading-relaxed text-ink">
            {dish.includes.map((part) => `${part.qty}× ${part.name}${part.sizeName ? ` (${part.sizeName})` : ''}`).join(' · ')}
          </p>
        )}
        {dish.description && <p className="mt-1 line-clamp-3 text-[0.95rem] leading-relaxed text-ink-2">{dish.description}</p>}
        {hours && <p className="mt-1 text-sm font-semibold text-ink-3">{hours}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <p className="font-semibold tabular-nums text-ink">
            {dish.sizes.length > 1 && <span className="text-sm font-normal text-ink-3">from </span>}
            {dish.sizes.length ? formatRs(from) : ''}
          </p>
          {orderable ? (
            <AddToCart dish={dish} groups={groups} />
          ) : (
            <span className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold text-ink-3">{dish.soldOut ? 'Sold out' : 'Not now'}</span>
          )}
        </div>
      </div>
      {dish.photo && <Photo src={dish.photo} sizes={dish.photoSizes} shownAt="112px" priority={priority} className="size-28 shrink-0 rounded-control" />}
    </li>
  );
}
