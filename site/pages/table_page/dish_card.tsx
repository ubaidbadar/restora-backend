import useCartStore from '../../store/cart_store';
import type AddonGroup from '../../types/addon_group';
import type Dish from '../../types/dish';
import formatRs from '../../utils/format_rs';
import saleHours from '../../utils/sale_hours';
import { AddButton } from './add_to_cart';
import DishDialog from './dish_dialog';
import Photo from '../../components/photo';
import Stepper from './stepper';

/**
 * A dish as a guest reads it: name, what it is, its price (from the smallest size), a photo, and the way to add it. A deal
 * also lists what is in it, and one sold only at some hours says when.
 */
export default function DishCard({ dish, groups, priority = false }: { dish: Dish; groups: AddonGroup[]; priority?: boolean }) {
  const lines = useCartStore((state) => state.lines);
  const from = Math.min(...dish.sizes.map((size) => size.price));
  const orderable = !dish.soldOut && dish.onSale && dish.sizes.length > 0;
  const hours = saleHours(dish);
  const simple = dish.sizes.length === 1 && groups.length === 0;
  const size = dish.sizes[0];
  const key = size ? `${dish._id}:${size._id}` : '';
  const line = simple && key ? lines.find((entry) => entry.key === key) : undefined;
  const inCart = lines.filter((entry) => entry.itemId === dish._id).reduce((sum, entry) => sum + entry.qty, 0);

  const handleSimpleAdd = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!orderable || !size || line) return;
    useCartStore.getState().add(
      {
        key,
        itemId: dish._id,
        name: dish.name,
        sizeId: size._id,
        sizeName: size.name || undefined,
        addonIds: [],
        addonNames: [],
        unitPrice: size.price,
      },
      1
    );
    navigator.vibrate?.(10);
  };

  const renderContent = (open?: () => void) => (
    <>
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
            simple ? (
              line ? (
                <Stepper
                  label={dish.name}
                  qty={line.qty}
                  onChange={(qty) => useCartStore.getState().setQty(key, qty)}
                />
              ) : (
                <AddButton label={`Add ${dish.name}`} onClick={handleSimpleAdd} />
              )
            ) : (
              <AddButton
                label={`Choose ${dish.name}`}
                count={inCart}
                onClick={(e) => {
                  e.stopPropagation();
                  open?.();
                }}
              />
            )
          ) : (
            <span className="rounded-full bg-canvas px-3 py-1 text-sm font-semibold text-ink-3">
              {dish.soldOut ? 'Sold out' : 'Not now'}
            </span>
          )}
        </div>
      </div>
      {dish.photo && (
        <Photo
          src={dish.photo}
          sizes={dish.photoSizes}
          shownAt="112px"
          priority={priority}
          className="size-28 shrink-0 rounded-control aspect-square object-cover object-center"
        />
      )}
    </>
  );

  if (!orderable) {
    return (
      <li className="flex gap-3.5 rounded-panel bg-paper p-4 shadow-slip opacity-60 cursor-not-allowed">
        {renderContent()}
      </li>
    );
  }

  if (simple) {
    return (
      <li
        onClick={() => {
          if (!line) handleSimpleAdd();
        }}
        className={`flex gap-3.5 rounded-panel bg-paper p-4 shadow-slip transition-all ${
          !line ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''
        }`}
      >
        {renderContent()}
      </li>
    );
  }

  return (
    <DishDialog
      dish={dish}
      groups={groups}
      component={({ open }) => (
        <li
          onClick={open}
          className="flex gap-3.5 rounded-panel bg-paper p-4 shadow-slip transition-all cursor-pointer hover:shadow-md active:scale-[0.99]"
        >
          {renderContent(open)}
        </li>
      )}
    />
  );
}
