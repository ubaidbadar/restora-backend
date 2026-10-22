import type { ReactNode } from 'react';
import { Building2, CalendarClock, Check, CloudOff, History, Lock, RefreshCw } from 'lucide-react';
import WhatsappIcon from '../../icons/whatsapp_icon';
import QrArt from './qr_art';

interface Tile {
  title: string;
  text: string;
  /** Grid placement on wide screens. */
  span?: string;
  dark?: boolean;
  visual: ReactNode;
}

const BOOKINGS = [
  { time: '8:00 pm', name: 'Ahmed Raza', guests: 6, table: 'T12', status: 'Seated', tone: 'bg-leaf-soft text-leaf' },
  { time: '8:30 pm', name: 'Sana Malik', guests: 2, table: 'T3', status: 'Confirmed', tone: 'bg-indigo-wash text-indigo' },
  { time: '9:15 pm', name: 'Usman family', guests: 9, table: 'T7+8', status: 'Confirmed', tone: 'bg-indigo-wash text-indigo' },
];

const LOG = [
  { who: 'Sana', what: 'changed the access of Bilal', when: '9:14 pm' },
  { who: 'Usman', what: 'registered the POS terminal Counter 2', when: '6:40 pm' },
  { who: 'Ayesha', what: 'set their POS PIN', when: '6:12 pm' },
];

const TILES: Tile[] = [
  {
    title: 'Guests order from their table',
    text: 'Every table gets its own QR code. Guests see the menu, order, call a waiter or ask for the bill. Print the cards for every table on A4.',
    span: 'lg:col-span-2',
    dark: true,
    visual: (
      <div className="flex items-end gap-5">
        <div className="shrink-0 -rotate-3 rounded-[14px] bg-paper p-3 text-ink shadow-lift">
          <QrArt className="size-20 sm:size-24" />
          <p className="mt-1.5 text-center text-[0.65rem] font-bold tracking-wide">TABLE 4</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 text-[0.8rem]">
          <span className="rounded-full bg-white/10 px-3 py-1.5">Chicken karahi (half) · Rs 1,200</span>
          <span className="rounded-full bg-white/10 px-3 py-1.5">Fresh lime · Rs 180</span>
          <span className="self-start rounded-full bg-haldi px-3 py-1.5 font-semibold text-ink">Send order</span>
        </div>
      </div>
    ),
  },
  {
    title: 'A board that\'s live',
    text: 'New, preparing, ready, done. Every phone and the counter see the same orders the moment they change.',
    visual: (
      <div className="grid grid-cols-3 gap-2 text-center text-[0.7rem] font-semibold">
        {[
          ['New', '2', 'bg-haldi text-ink'],
          ['Preparing', '5', 'bg-indigo-wash text-indigo'],
          ['Ready', '3', 'bg-leaf-soft text-leaf'],
        ].map(([label, count, tone]) => (
          <div key={label} className="rounded-[14px] bg-canvas p-2.5">
            <p className={`mx-auto grid size-9 place-items-center rounded-full font-display text-lg font-bold ${tone}`}>{count}</p>
            <p className="mt-1.5 text-ink-2">{label}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Reservations',
    text: 'Book a table for a time and a party size, see the day at a glance, and seat them when they walk in.',
    visual: (
      <ul className="flex flex-col gap-1.5 text-[0.75rem]">
        {BOOKINGS.map((booking) => (
          <li key={booking.time} className="flex items-center gap-2.5 rounded-[12px] bg-canvas px-3 py-2">
            <CalendarClock className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span className="w-14 shrink-0 font-semibold tabular-nums">{booking.time}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              {booking.name} · {booking.guests}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${booking.tone}`}>{booking.status}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: 'A counter that locks itself',
    text: 'Turn any tablet into a POS. Staff open it with their own PIN, it locks when left alone, and pauses after too many wrong PINs.',
    visual: (
      <div className="flex items-center gap-5">
        <div className="grid size-14 shrink-0 place-items-center rounded-full bg-night text-white">
          <Lock className="size-6" aria-hidden="true" />
        </div>
        <div>
          <div className="flex gap-2.5">
            {[1, 1, 1, 0].map((filled, index) => (
              <span key={index} className={`size-3.5 rounded-full ${filled ? 'bg-ink' : 'border-2 border-ink/30'}`} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[0.8rem] font-semibold tabular-nums">
            {['1', '2', '3', '4', '5', '6'].map((key) => (
              <span key={key} className="grid h-7 w-10 place-items-center rounded-[8px] bg-canvas">{key}</span>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Keeps going offline',
    text: 'When the internet drops, orders are saved on the phone with their own numbers, and send themselves when it\'s back.',
    visual: (
      <div className="flex flex-col items-start gap-2 text-[0.8rem] font-semibold">
        <span className="inline-flex items-center gap-2 rounded-full bg-chili px-3 py-1.5 text-white">
          <CloudOff className="size-4" aria-hidden="true" />
          Offline: 3 orders waiting
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-leaf px-3 py-1.5 text-white">
          <RefreshCw className="size-4" aria-hidden="true" />
          Back online: all sent
        </span>
      </div>
    ),
  },
  {
    title: 'Guests who ask for your offers',
    text: 'At the end of the QR menu, guests can leave their number for offers on WhatsApp, by choice.',
    visual: (
      <div className="rounded-[14px] bg-canvas p-3.5 text-[0.8rem]">
        <p className="flex items-center gap-2 font-semibold">
          <WhatsappIcon className="size-4 text-leaf" />
          Get offers on WhatsApp
        </p>
        <p className="mt-2 flex items-center gap-2 text-ink-2">
          <span className="grid size-4 place-items-center rounded-[4px] bg-indigo text-white">
            <Check className="size-3" strokeWidth={3} aria-hidden="true" />
          </span>
          Yes, send me offers
        </p>
      </div>
    ),
  },
  {
    title: 'Every change, on the record',
    text: 'Choose what each role can do. Changes to the team, roles, settings and counters are logged with who made them, and when.',
    visual: (
      <ul className="flex flex-col gap-1.5 text-[0.75rem]">
        {LOG.map((entry) => (
          <li key={entry.when} className="flex items-center gap-2.5 rounded-[12px] bg-canvas px-3 py-2">
            <History className="size-4 shrink-0 text-ink-3" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-semibold">{entry.who}</span> <span className="text-ink-2">{entry.what}</span>
            </span>
            <span className="text-ink-3 tabular-nums">{entry.when}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    title: 'Every branch, every restaurant',
    text: 'Switch branch in a tap and see them all together. One login can work in more than one restaurant.',
    visual: (
      <ul className="flex flex-col gap-1.5 text-[0.8rem]">
        {[
          ['Gulberg', 'Rs 84,350', true],
          ['DHA Phase 6', 'Rs 61,900', false],
          ['Johar Town', 'Rs 47,120', false],
        ].map(([branch, sales, current]) => (
          <li key={branch as string} className={`flex items-center gap-2.5 rounded-[12px] px-3 py-2 ${current ? 'bg-indigo text-white' : 'bg-canvas'}`}>
            <Building2 className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 font-semibold">{branch}</span>
            <span className={`tabular-nums ${current ? 'text-white/80' : 'text-ink-3'}`}>{sales}</span>
          </li>
        ))}
      </ul>
    ),
  },
];

/** What Restora does beyond taking an order, as tiles: each says it in two lines and shows a small piece of the app. */
export default function FeatureBento() {
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {TILES.map((tile) => (
        <li
          key={tile.title}
          className={`flex min-w-0 flex-col justify-between gap-8 rounded-panel p-6 motion-safe:reveal sm:p-7 ${tile.span ?? ''} ${tile.dark ? 'bg-night text-white sm:col-span-2' : 'bg-paper text-ink shadow-slip'}`}
        >
          <div>
            <h3 className="text-[1.45rem] leading-tight font-semibold tracking-tight">{tile.title}</h3>
            <p className={`mt-2 max-w-md ${tile.dark ? 'text-moon' : 'text-ink-2'}`}>{tile.text}</p>
          </div>
          {tile.visual}
        </li>
      ))}
    </ul>
  );
}
