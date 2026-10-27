import type { IPrinter } from '../models/print_agent';

/** The printers Windows lists now, joined to what staff already set: kept as they were, new ones unused, missing ones marked not present. */
export default function mergePrinters(saved: IPrinter[], listed: string[]): IPrinter[] {
  const known = new Map(saved.map((printer) => [printer.systemName, printer]));
  const merged = listed.map((systemName): IPrinter => {
    const printer = known.get(systemName);
    if (printer) return { ...printer, present: true };
    return { systemName, label: systemName, prints: [], categoryIds: [], width: 48, copies: 1, present: true };
  });
  const gone = saved.filter((printer) => !listed.includes(printer.systemName)).map((printer) => ({ ...printer, present: false }));
  return [...merged, ...gone];
}
