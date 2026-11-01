import { CalendarDays } from 'lucide-react';

/** Home's quiet line under the header saying what the numbers are for, as the app draws it at two thirds of its size. */
export default function HomeFilterLine() {
  return (
    <p className="mx-3 mt-2.5 flex items-center gap-1.5 text-[0.62rem] text-app-body">
      <CalendarDays className="size-3 text-app-muted" />
      <span>
        <span className="font-semibold text-ink">Today</span> · This branch
      </span>
    </p>
  );
}
