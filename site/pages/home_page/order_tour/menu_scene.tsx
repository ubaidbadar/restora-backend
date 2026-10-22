import { Check, Plus } from 'lucide-react';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

const DISHES = [
  { name: 'Chicken karahi', note: 'Half · less spicy', price: 'Rs 1,200', tap: 0.5 },
  { name: 'Tandoori roti', note: '', price: 'Rs 40', tap: 1.1 },
  { name: 'Fresh lime', note: '', price: 'Rs 180', tap: 1.7 },
  { name: 'Seekh kebab', note: '4 pieces', price: 'Rs 650', tap: undefined },
];

/** What the cart bar says after each tap: it counts up as the guest adds dishes. */
const CART = [
  { at: 0.5, until: 1.1, count: '1 item', total: 'Rs 1,200' },
  { at: 1.1, until: 1.7, count: '2 items', total: 'Rs 1,240' },
  { at: 1.7, until: undefined, count: '3 items', total: 'Rs 1,420' },
];

/** Step 2, on the guest's phone: the table's menu. Three dishes go in the cart, then Send order. */
export default function MenuScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="7:03" />
      <div className="px-5 pt-1">
        <p className="text-[0.7rem] font-semibold text-ink-3">Table 4</p>
        <p className="font-display text-xl font-bold tracking-tight text-ink">Lahori Karahi House</p>
        <div className="mt-3 flex gap-1.5 text-[0.7rem] font-semibold">
          <span className="rounded-full bg-ink px-2.5 py-1 text-white">Karahi</span>
          <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2">BBQ</span>
          <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2">Breads</span>
          <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2">Drinks</span>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-2 px-3">
        {DISHES.map((dish) => (
          <li key={dish.name} className="flex items-center gap-3 rounded-[14px] bg-paper p-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.85rem] font-semibold text-ink">{dish.name}</span>
              {dish.note && <span className="block text-[0.7rem] text-ink-3">{dish.note}</span>}
              <span className="block text-[0.75rem] font-semibold text-ink-2">{dish.price}</span>
            </span>
            <span className={`grid size-8 place-items-center rounded-full bg-indigo text-white ${dish.tap === undefined ? '' : 'motion-safe:tour-tap'}`} style={dish.tap === undefined ? undefined : tourAt(dish.tap)}>
              <Plus className="size-4" strokeWidth={3} />
            </span>
          </li>
        ))}
      </ul>

      {/* The cart bar rises with the first dish and counts up; Send order is pressed, and the order is on its way. */}
      <div className="absolute inset-x-3 bottom-3 motion-safe:tour-pop" style={tourAt(0.5)}>
        <div className="flex items-center gap-3 rounded-[16px] bg-ink p-2 ps-4 text-white shadow-lift">
          <span className="grid flex-1 text-[0.8rem]">
            {CART.map((step) => (
              <span key={step.count} className="[grid-area:1/1] motion-safe:tour-pop" style={tourAt(step.at)}>
                <span className={`block ${step.until === undefined ? '' : 'motion-safe:tour-hide motion-reduce:hidden'}`} style={step.until === undefined ? undefined : tourAt(step.until)}>
                  <span className="block font-semibold">{step.count}</span>
                  <span className="block text-moon">{step.total}</span>
                </span>
              </span>
            ))}
          </span>
          <span className="rounded-control bg-indigo px-3.5 py-2.5 text-[0.8rem] font-semibold motion-safe:tour-tap" style={tourAt(2.4)}>
            Send order
          </span>
        </div>
      </div>
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-[16px] bg-leaf p-4 text-[0.85rem] font-semibold text-white shadow-lift motion-safe:tour-pop motion-reduce:hidden" style={tourAt(2.8)}>
        <Check className="size-4" strokeWidth={3} />
        Order sent. The kitchen has it.
      </div>
    </div>
  );
}
