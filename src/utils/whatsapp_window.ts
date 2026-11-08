/** Meta allows free-form business replies only within 24 hours of the customer's last message. */
export const WHATSAPP_CUSTOMER_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Clock skew up to one minute is tolerated; an invalid timestamp never opens the window. */
export function isWhatsAppWindowOpen(lastIncomingAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastIncomingAt) return false;
  const at = new Date(lastIncomingAt).getTime();
  return Number.isFinite(at) && at <= now + 60_000 && now - at < WHATSAPP_CUSTOMER_WINDOW_MS;
}
