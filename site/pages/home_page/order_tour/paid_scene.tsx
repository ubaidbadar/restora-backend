import { TrendingUp } from 'lucide-react';
import WhatsappIcon from '../../../icons/whatsapp_icon';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

const LINES = [
  ['1', 'Chicken karahi (half)', '1,200'],
  ['1', 'Tandoori roti', '40'],
  ['1', 'Fresh lime', '180'],
];

/** Step 5: table 4 pays by JazzCash, the receipt goes to them on WhatsApp, and the day's sales already include it. */
export default function PaidScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="8:12" />
      <div className="relative mx-auto mt-3 w-[86%]">
        <div className="tear-bottom bg-paper px-4 pt-4 pb-7 font-slip text-[0.7rem] leading-[1.6] text-ink shadow-slip">
          <p className="text-center font-semibold tracking-wide">LAHORI KARAHI HOUSE</p>
          <p className="text-center text-ink-3">Order #28 · Table 4</p>
          <div className="my-2 border-t-2 border-dashed border-ink/25" />
          {LINES.map(([qty, item, amount]) => (
            <p key={item} className="flex gap-2">
              <span className="w-3">{qty}</span>
              <span className="flex-1">{item}</span>
              <span>{amount}</span>
            </p>
          ))}
          <div className="my-2 border-t-2 border-dashed border-ink/25" />
          <p className="flex justify-between">
            <span>Tax 5% (JazzCash)</span>
            <span>71</span>
          </p>
          <p className="mt-1 flex justify-between text-[0.85rem] font-semibold">
            <span>TOTAL</span>
            <span>Rs 1,491</span>
          </p>
        </div>
        <div className="absolute end-3 -bottom-14 grid size-20 place-items-center rounded-full border-[3px] border-leaf text-center font-display text-leaf mix-blend-multiply motion-safe:tour-stamp" style={tourAt(0.8)}>
          <span className="leading-none">
            <span className="block text-lg font-extrabold">PAID</span>
            <span className="block text-[0.55rem] font-semibold">JazzCash</span>
          </span>
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2 rounded-[14px] bg-leaf-soft p-3 text-[0.8rem] font-semibold text-leaf motion-safe:tour-pop" style={tourAt(1.6)}>
          <WhatsappIcon className="size-4" />
          Receipt sent to the guest on WhatsApp
        </div>
        <div className="flex items-center gap-3 rounded-[14px] bg-night p-3 text-white motion-safe:tour-pop" style={tourAt(2.3)}>
          <TrendingUp className="size-5 text-haldi" />
          <span className="flex-1">
            <span className="block text-[0.7rem] text-moon">Sales today</span>
            <span className="block font-display text-lg font-bold">Rs 84,350</span>
          </span>
          <span className="text-end">
            <span className="block text-[0.7rem] text-moon">Orders</span>
            <span className="block font-display text-lg font-bold">61</span>
          </span>
        </div>
      </div>
    </div>
  );
}
