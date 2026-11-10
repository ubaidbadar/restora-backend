/** The Restora platform OTP number must never be attached to a restaurant inbox. */
export default function isPlatformWhatsAppNumber(phoneNumberId: string): boolean {
  const reserved = [
    process.env.WHATSAPP_PLATFORM_PHONE_NUMBER_ID,
    process.env.WHATSAPP_PHONE_NUMBER_ID,
  ].filter((value): value is string => Boolean(value));
  return reserved.includes(phoneNumberId);
}
