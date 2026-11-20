import { describe, expect, it } from 'bun:test';
import mergePrinters from '../src/utils/merge_printers';
import type { IPrinter } from '../src/models/print_agent';

const existing = (systemName: string, prints: IPrinter['prints'], present = true): IPrinter => ({
  systemName, label: systemName, prints, categoryIds: [], width: 48, copies: 1, present,
});

describe('automatic native Windows printer routing', () => {
  it('uses the Windows default, not the enumeration order', () => {
    const printers = mergePrinters([], ['Office A4', 'Counter POS'], 'Counter POS');
    expect(printers[0]?.prints).toEqual([]);
    expect(printers[1]?.prints).toEqual(['kitchen', 'receipt']);
  });

  it('never assigns arbitrary printers if Windows has no default', () => {
    expect(mergePrinters([], ['Counter POS']).map((p) => p.prints)).toEqual([[]]);
  });

  it('preserves manual kitchen and receipt assignments', () => {
    const printers = mergePrinters([
      existing('Kitchen', ['kitchen']),
      existing('Receipt', ['receipt']),
    ], ['Kitchen', 'Receipt', 'New device'], 'New device');
    expect(printers.map((p) => p.prints)).toEqual([['kitchen'], ['receipt'], []]);
  });

  it('does not reroute slips from a missing configured printer', () => {
    const printers = mergePrinters([existing('Kitchen', ['kitchen'])], ['Receipt'], 'Receipt');
    expect(printers.find((p) => p.systemName === 'Kitchen')).toMatchObject({
      present: false, prints: ['kitchen'],
    });
    expect(printers.find((p) => p.systemName === 'Receipt')?.prints).toEqual(['receipt']);
  });

  it('moves only automatic assignments when Windows changes its default printer', () => {
    const first = mergePrinters([], ['Counter', 'Kitchen'], 'Counter');
    const second = mergePrinters(first, ['Counter', 'Kitchen'], 'Kitchen');
    expect(second.map((p) => p.prints)).toEqual([[], ['kitchen', 'receipt']]);
    expect(second[1]?.automatic).toBe(true);
  });

  it('does not modify the saved printer objects', () => {
    const saved = [existing('Receipt', [])];
    mergePrinters(saved, ['Receipt'], 'Receipt');
    expect(saved[0]?.prints).toEqual([]);
  });
});
