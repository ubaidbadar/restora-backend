import normalizePhone from './normalize_phone';

/** Public presentation is 03XXXXXXXXX; Graph API receives 923XXXXXXXXX. */
export function whatsappPhone(value: string): string | null {
  const normalized = normalizePhone(value);
  return normalized ? `0${normalized.slice(3)}` : null;
}
export function graphPhone(value: string): string | null {
  const normalized = normalizePhone(value);
  return normalized ? normalized.slice(1) : null;
}
