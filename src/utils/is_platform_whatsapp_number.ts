/** The Restora platform OTP number must never be attached to a restaurant inbox. */
export function platformWhatsAppNumberIds(): string[] {
  return [...new Set([
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID,
    process.env.WHATSAPP_PHONE_NUMBER_ID,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

export default function isPlatformWhatsAppNumber(phoneNumberId: string): boolean {
  return platformWhatsAppNumberIds().includes(phoneNumberId);
}
