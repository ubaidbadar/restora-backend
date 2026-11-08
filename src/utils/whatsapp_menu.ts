/** WhatsApp list messages allow ten rows total. Reserve one for pagination when needed. */
export function paginateWhatsApp<T>(items: T[], requestedPage: number, capacity = 10) {
  const page = Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0);
  const start = page * (capacity - 1);
  const remaining = items.length - start;
  const hasNext = remaining > capacity;
  const take = hasNext ? capacity - 1 : capacity;
  return { page, rows: items.slice(start, start + take), next: hasNext ? page + 1 : null };
}
export function safeWhatsAppText(value: string, limit = 24): string {
  return value.trim().slice(0, limit) || 'Item';
}
