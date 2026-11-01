import { CalendarDays, SlidersHorizontal } from 'lucide-react';

/**
 * Home's line above the numbers, as the app draws it at two thirds of its size: what the numbers are for and the
 * Filter button (the app's 44px outline button, 8px corners, scaled).
 */
export default function HomeFilterRow() {
  return (
    <div className="mx-3 mt-2.5 flex items-center justify-between gap-2">
      <p className="flex items-center gap-1.5 text-[0.62rem] text-app-body">
        <CalendarDays className="size-3 text-app-muted" />
        <span>
          <span className="font-semibold text-ink">Today</span> · This branch
        </span>
      </p>
      <span className="grid size-[1.85rem] place-items-center rounded-[5px] border border-app-border-strong bg-paper text-ink">
        <SlidersHorizontal className="size-3" />
      </span>
    </div>
  );
}
