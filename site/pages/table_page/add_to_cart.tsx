import { Plus } from 'lucide-react';
import useCartStore from '../../store/cart_store';
import type AddonGroup from '../../types/addon_group';
import type Dish from '../../types/dish';
import DishDialog from './dish_dialog';
import Stepper from './stepper';

/**
 * Adding a dish. One with nothing to choose goes straight in, and then shows how many; one with sizes or add-ons opens
 * its sheet first.
 */
export default function AddToCart({ dish, groups }: { dish: Dish; groups: AddonGroup[] }) {
  const lines = useCartStore((state) => state.lines);
  const size = dish.sizes[0]!;
  const simple = dish.sizes.length === 1 && groups.length === 0;
  const key = `${dish._id}:${size._id}`;
  const inCart = lines.filter((line) => line.itemId === dish._id).reduce((sum, line) => sum + line.qty, 0);

  if (simple) {
    const line = lines.find((entry) => entry.key === key);
    if (line) return <Stepper label={dish.name} qty={line.qty} onChange={(qty) => useCartStore.getState().setQty(key, qty)} />;
    return (
      <AddButton
        label={`Add ${dish.name}`}
        onClick={() => {
          useCartStore.getState().add({ key, itemId: dish._id, name: dish.name, sizeId: size._id, sizeName: size.name || undefined, addonIds: [], addonNames: [], unitPrice: size.price }, 1);
          navigator.vibrate?.(10);
        }}
      />
    );
  }

  return <DishDialog dish={dish} groups={groups} component={({ open }) => <AddButton label={`Choose ${dish.name}`} count={inCart} onClick={open} />} />;
}

function AddButton({ label, count = 0, onClick }: { label: string; count?: number; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="relative grid size-11 shrink-0 place-items-center rounded-full bg-indigo-wash text-indigo transition-[background-color,color,scale] hover:bg-indigo hover:text-white active:scale-95"
    >
      <Plus aria-hidden="true" className="size-5" strokeWidth={2.5} />
      {count > 0 && (
        <span className="absolute -top-1 -end-1 grid min-w-5 place-items-center rounded-full bg-indigo px-1 text-xs font-bold tabular-nums text-white ring-2 ring-paper" aria-label={`${count} in your order`}>
          {count}
        </span>
      )}
    </button>
  );
}
