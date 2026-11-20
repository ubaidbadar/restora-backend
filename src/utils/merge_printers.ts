import type { IPrinter } from '../models/print_agent';

/**
 * Preserve manual routing, while automatically selecting the Windows default
 * for any unassigned slip type. Automatic assignments follow a changed OS
 * default; explicitly configured or temporarily missing printers do not.
 */
export default function mergePrinters(saved: IPrinter[], listed: string[], defaultPrinter?: string): IPrinter[] {
  // Mongoose returns printer subdocuments, whose public fields are getters.
  // Spread on a subdocument loses the name and automatic-routing flag.
  const known = new Map(saved.map((savedPrinter) => {
    const document = savedPrinter as IPrinter & { toObject?: () => IPrinter };
    const printer = typeof document.toObject === 'function' ? document.toObject() : savedPrinter;
    return [printer.systemName, printer] as const;
  }));
  const merged = listed.map((systemName): IPrinter => {
    const printer = known.get(systemName);
    if (printer) return { ...printer, prints: [...printer.prints], categoryIds: [...printer.categoryIds], present: true };
    return { systemName, label: systemName, prints: [], categoryIds: [], width: 48, copies: 1, present: true };
  });
  const gone = [...known.values()].filter((printer) => !listed.includes(printer.systemName)).map((printer) => ({
    ...printer, prints: [...printer.prints], categoryIds: [...printer.categoryIds], present: false,
  }));
  const result = [...merged, ...gone];

  // Only move automatically assigned slips when Windows actually reports a
  // new default. No default is not permission to guess or to lose a route.
  if (defaultPrinter && result.some((printer) => printer.systemName === defaultPrinter && printer.present)) {
    for (const printer of result) {
      if (printer.automatic && printer.systemName !== defaultPrinter) {
        printer.prints = [];
        printer.automatic = false;
      }
    }
    const target = result.find((printer) => printer.present && printer.systemName === defaultPrinter)!;
    for (const kind of ['kitchen', 'receipt'] as const) {
      if (!result.some((printer) => printer.prints.includes(kind))) {
        target.prints.push(kind);
        target.automatic = true;
      }
    }
  }
  return result;
}
