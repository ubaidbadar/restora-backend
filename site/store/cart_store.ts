import type CartLine from '../types/cart_line';
import createStore from './create_store';

interface CartState {
  code: string;
  lines: CartLine[];
  /** Made afresh whenever the cart changes: sending the same cart twice is one order. */
  clientId: string;
  /** Orders this phone sent from the table in this visit, newest first. */
  sent: { token: number; at: string }[];
  /** The order just sent, until the cart changes again: the cart shows its number. */
  justSent: number | null;
  /** Reads this table's cart from the tab (a reload or a phone call does not empty it). */
  load: (code: string) => void;
  add: (line: Omit<CartLine, 'qty'>, qty: number) => void;
  setQty: (key: string, qty: number) => void;
  markSent: (token: number) => void;
}

const storageKey = (code: string) => `restora.table.${code}`;

/** The guest's cart for one table. The server renders it empty; the table page loads it from this tab after hydration. */
const useCartStore = createStore<CartState>((set, get) => {
  // Any change makes a new client id: the same cart sent twice is one order, a changed cart is a new one.
  const save = (lines: CartLine[], sent: CartState['sent'], justSent: number | null = null) => {
    set({ lines, sent, justSent, clientId: crypto.randomUUID() });
    try {
      sessionStorage.setItem(storageKey(get().code), JSON.stringify({ lines, sent }));
    } catch {}
  };

  return {
    code: '',
    lines: [],
    clientId: '',
    sent: [],
    justSent: null,
    load: (code) => {
      let saved: { lines?: CartLine[]; sent?: CartState['sent'] } = {};
      try {
        saved = JSON.parse(sessionStorage.getItem(storageKey(code)) ?? '{}');
      } catch {}
      set({ code, lines: saved.lines ?? [], sent: saved.sent ?? [], justSent: null, clientId: crypto.randomUUID() });
    },
    add: (line, qty) => {
      const { lines, sent } = get();
      const existing = lines.find((entry) => entry.key === line.key);
      save(existing ? lines.map((entry) => (entry.key === line.key ? { ...entry, qty: Math.min(20, entry.qty + qty) } : entry)) : [...lines, { ...line, qty }], sent);
    },
    setQty: (key, qty) => {
      const { lines, sent } = get();
      save(qty > 0 ? lines.map((entry) => (entry.key === key ? { ...entry, qty: Math.min(20, qty) } : entry)) : lines.filter((entry) => entry.key !== key), sent);
    },
    markSent: (token) => save([], [{ token, at: new Date().toISOString() }, ...get().sent], token),
  };
});

export default useCartStore;
