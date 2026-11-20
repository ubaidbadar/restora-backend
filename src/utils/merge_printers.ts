import type { IPrinter } from '../models/print_agent';

/**
 * Merge Windows discovery without destroying explicit printer assignments.
 * When staff haven't assigned a slip type, send it to the actual Windows
 * default printer. Never guess from enumeration order or silently reroute a
 * missing printer: its jobs must remain visible for recovery.
 */
export default function mergePrinters(saved: IPrinter[], listed: string[], defaultPrinter?: string): IPrinter[] {
  const known = new Map(saved.map((printer) => [printer.systemName, printer]));
  const merged = listed.map((systemName): IPrinter => {
    const printer = known.get(systemName);
    if (printer) return { ...printer, present: true };
    return { systemName, label: systemName, prints: [], categoryIds: [], width: 48, copies: 1, present: true };
  });
  const gone = saved.filter((printer) => !listed.includes(printer.systemName)).map((printer) => ({ ...printer, present: false }));
  const result = [...merged, ...gone];

  const target = result.find((printer) => printer.present && printer.systemName === defaultPrinter);
  if (target) {
    // Each kind is assigned only when no configured printer (including one
    // currently missing) already owns it. This preserves multi-printer kitchens.
    for (const kind of ['kitchen', 'receipt'] as const) {
      if (!result.some((printer) => printer.prints.includes(kind))) {
        target.prints.push(kind);
      }
    }
  }
  return result;
}
