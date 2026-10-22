import type { CSSProperties, ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import BoardScene from './board_scene';
import MenuScene from './menu_scene';
import PaidScene from './paid_scene';
import ScanScene from './scan_scene';
import TablesScene from './tables_scene';

interface Step {
  time: string;
  title: string;
  text: string;
  scene: ReactNode;
}

const STEPS: Step[] = [
  { time: '7:02 pm', title: 'Guests scan the code on their table', text: 'Your menu opens on their phone, with your prices and what is sold out tonight. No app to download.', scene: <ScanScene /> },
  { time: '7:03 pm', title: 'They order by themselves', text: 'Half or full, extra raita, "less spicy". Then Send. Or a waiter takes the order on their own phone.', scene: <MenuScene /> },
  { time: '7:03 pm', title: 'It lands on every screen at once', text: 'The orders board is live on every phone and the counter. Accept it, and the kitchen slip prints.', scene: <BoardScene /> },
  { time: '7:31 pm', title: 'One tap calls a waiter', text: 'Calls and bill requests pop up on every waiter\'s phone, whatever page they are on. One of them takes it.', scene: <TablesScene /> },
  { time: '8:12 pm', title: 'Paid, and the day adds itself up', text: 'Cash, card, JazzCash, Easypaisa or khata. The receipt goes on WhatsApp, and today\'s sales already count it.', scene: <PaidScene /> },
];

/** Each step starts 4s after the one before it, on the tour's 20s loop (index.css). */
const delayOf = (index: number) => ({ '--d': `${index * 4}s` }) as CSSProperties;

/**
 * How an order goes through Restora, played on a phone: five steps on a loop, the step being shown lit on the side.
 * CSS only, so it runs on a page with no script. It can be paused (the toggle, or by hovering the phone). With reduced
 * motion, or where it can't animate, the five screens sit side by side instead, still and complete.
 */
export default function OrderTour() {
  return (
    <section id="tour" aria-labelledby="tour-title" className="tour scroll-mt-16 overflow-hidden bg-night text-white">
      <div className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8 lg:py-32">
        <p className="font-semibold text-haldi">How it works</p>
        <h2 id="tour-title" className="display mt-3 max-w-3xl text-[clamp(2.6rem,6vw,4.75rem)]">
          From the table&apos;s QR code to the day&apos;s total.
        </h2>
        <p className="mt-6 max-w-xl text-lg text-moon">One order at Lahori Karahi House, as it happens. Nobody writes anything twice.</p>

        <div className="mt-14 grid items-center gap-12 lg:mt-20 lg:grid-cols-[1fr_auto] lg:gap-20">
          <ol className="tour-steps lg:order-first">
            {STEPS.map((step, index) => (
              <li key={step.title} style={delayOf(index)} className="tour-step relative rounded-[18px] p-4 sm:p-5">
                <p className="font-display text-sm font-bold text-haldi tabular-nums">
                  <span className="text-moon">{String(index + 1).padStart(2, '0')}</span> · {step.time}
                </p>
                <h3 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{step.title}</h3>
                <p className="mt-1.5 max-w-md text-moon">{step.text}</p>
                {/* How long until the next step: fills while this one plays. */}
                <span aria-hidden="true" className="absolute inset-x-4 bottom-0 hidden h-0.5 overflow-hidden rounded-full bg-white/10 motion-safe:block sm:inset-x-5">
                  <span className="block h-full bg-haldi motion-safe:tour-bar" />
                </span>
              </li>
            ))}
          </ol>

          <div className="flex min-w-0 flex-col items-center gap-5 max-lg:motion-safe:order-first lg:order-last">
            {/* The phone. Each screen is described by its step, so the drawing itself is hidden from screen readers. */}
            <div
              aria-hidden="true"
              data-tour-stage=""
              className="tour-stage"
            >
              <span className="absolute top-3 left-1/2 z-10 hidden h-6 w-24 -translate-x-1/2 rounded-full bg-ink motion-safe:block" />
              {STEPS.map((step, index) => (
                <div
                  key={step.title}
                  style={delayOf(index)}
                  className="tour-screen"
                >
                  {step.scene}
                </div>
              ))}
            </div>
            {/* Pause and play, without a script: the checkbox pauses every animation in the tour (index.css). */}
            <label className="hidden cursor-pointer items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-haldi hover:bg-white/15 motion-safe:inline-flex">
              <input type="checkbox" aria-label="Pause the tour" className="tour-pause peer sr-only" />
              <Pause className="size-4 peer-checked:hidden" aria-hidden="true" />
              <Play className="hidden size-4 peer-checked:block" aria-hidden="true" />
              <span aria-hidden="true" className="peer-checked:hidden">Pause</span>
              <span aria-hidden="true" className="hidden peer-checked:inline">Play</span>
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}
