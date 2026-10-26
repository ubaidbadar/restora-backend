const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const time = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
};

/** When a deal is sold, in words: "Mon, Tue · 12pm to 4pm" (the week from Monday), or '' when it is always sold. */
export default function saleHours({ days, from, to }: { days?: number[]; from?: string; to?: string }): string {
  return [days?.length ? [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((day) => DAYS[day]).join(', ') : '', from && to ? `${time(from)} to ${time(to)}` : ''].filter(Boolean).join(' · ');
}
