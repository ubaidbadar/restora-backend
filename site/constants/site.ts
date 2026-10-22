/** Where things are, said once. The app's address can be changed per build (CLIENT_ORIGIN). */
const SITE = {
  name: 'Restora',
  url: 'https://restora.live',
  appUrl: process.env.CLIENT_ORIGIN ?? 'https://app.restora.live',
  email: 'admin@restora.live',
  /** International format for links, the local way for people. */
  whatsapp: '923476262068',
  whatsappDisplay: '0347 6262068',
  tagline: 'Orders, tables and khata for your restaurant',
  description:
    'Restora runs your restaurant from your phone: guests order from a QR code on their table, staff see a live orders board, and you keep khata, bookings and WhatsApp customers in one place. It keeps working when the internet doesn\'t. Free for now.',
} as const;

export default SITE;
