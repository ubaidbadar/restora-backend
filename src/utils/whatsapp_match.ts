/**
 * Validate untrusted LLM item IDs against the exact customer wording and the
 * restaurant's live menu. An ID that exists is not enough: a model can pick a
 * plausible but different dish or size. Ambiguity must be clarified instead.
 */
export interface WhatsAppMatchItem {
  id: string;
  name: string;
  sizes: { id: string; name: string; price: number }[];
}
export interface WhatsAppLLMSelection {
  itemId: string;
  sizeId: string;
  qty: number;
}
function normalized(value: string): string {
  return value.toLocaleLowerCase('en').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function wordsContain(haystack: string, needle: string): boolean {
  return !!needle && (' ' + haystack + ' ').includes(' ' + needle + ' ');
}
export function validateWhatsAppLLM(
  text: string, menu: WhatsAppMatchItem[], rawItems: unknown, rawUnmatched: unknown
): { selections: WhatsAppLLMSelection[]; unmatched: string[] } {
  const request = normalized(text);
  const unmatched: string[] = Array.isArray(rawUnmatched)
    ? rawUnmatched.filter((x): x is string => typeof x === 'string').slice(0, 20)
    : [];
  const selections: WhatsAppLLMSelection[] = [];
  for (const raw of Array.isArray(rawItems) ? rawItems.slice(0, 40) : []) {
    if (!raw || typeof raw !== 'object') { unmatched.push('Unknown item'); continue; }
    const item = raw as Record<string, unknown>;
    const name = typeof item.rawName === 'string' ? normalized(item.rawName) : '';
    const entry = menu.find((candidate) => candidate.id === item.itemId);
    const matches = menu.filter((candidate) => wordsContain(normalized(candidate.name), name));
    // The requested phrase must occur in the actual message, and map to exactly one dish.
    if (!entry || !name || name.length < 3 || !wordsContain(request, name) || matches.length !== 1 || matches[0]?.id !== entry.id) {
      unmatched.push(typeof item.rawName === 'string' ? item.rawName : 'Unknown dish');
      continue;
    }
    const size = entry?.sizes.find((s) => s.id === item.sizeId);
    if (!size || typeof item.qty !== 'number' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10) {
      unmatched.push(typeof item.rawName === 'string' ? item.rawName : 'Invalid dish, size or quantity');
      continue;
    }
    if (entry.sizes.length > 1) {
      const rawSize = typeof item.rawSize === 'string' ? normalized(item.rawSize) : '';
      const sizeMatches = entry.sizes.filter((candidate) => wordsContain(normalized(candidate.name), rawSize));
      if (!rawSize || !wordsContain(request, rawSize) || sizeMatches.length !== 1 || sizeMatches[0]?.id !== size.id) {
        unmatched.push(entry.name + ' (which size?)');
        continue;
      }
    }
    const existing = selections.find((selection) => selection.itemId === entry.id && selection.sizeId === size.id);
    if (existing) {
      if (existing.qty + item.qty > 20) {
        unmatched.push(entry.name + ' (maximum 20 per size)');
        continue;
      }
      existing.qty += item.qty;
    } else {
      selections.push({ itemId: entry.id, sizeId: size.id, qty: item.qty });
    }
  }
  return { selections, unmatched: unmatched.slice(0, 20) };
}

