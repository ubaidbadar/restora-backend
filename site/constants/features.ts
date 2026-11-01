/** What Restora does today, grouped as an owner thinks of it. Everything here is in the product now. */
const FEATURES = [
  {
    id: 'orders',
    icon: 'orders',
    title: 'Orders, from counter to kitchen',
    summary: 'Take dine-in, takeaway and delivery orders on a phone, tablet or laptop. Every order moves from new to preparing, ready and done on one board, live on every screen.',
    points: ['Sizes, add-ons and notes per dish', 'The board updates live on every phone', 'A chime and a "Just in" mark for every new order', 'Edit dishes until the bill is paid', 'Each order keeps its history: who added, removed or changed what', 'Daily order numbers staff can call out'],
  },
  {
    id: 'printing',
    icon: 'printing',
    title: 'Kitchen slips that print themselves',
    summary: 'Install Restora Print, a free Windows app, on the counter PC. Every new order prints in the kitchen on its own, guest orders from the QR menu too, and receipts carry your logo.',
    points: ['A kitchen slip for every order, with nobody pressing print', 'Keeps printing orders taken on the PC while offline', 'Your logo on receipts', 'Changed and cancelled orders print a clear slip', 'Receipt, USB and network printers', 'Or print from the browser on any device'],
  },
  {
    id: 'tables',
    icon: 'tables',
    title: 'Tables with QR codes',
    summary: 'Each table gets its own QR code. Guests see your menu on their phone, order by themselves, call a waiter or ask for the bill, and your staff see it at once.',
    points: ['Guests order from the QR menu, staff accept', 'Calls and bill requests show on every page', 'Printable QR cards for every table', 'Busy and free tables at a glance'],
  },
  {
    id: 'reservations',
    icon: 'reservations',
    title: 'Reservations',
    summary: 'Book a table for a time and a party size. See the day\'s bookings at a glance, confirm them, and seat guests on their table when they arrive.',
    points: ['Day by day list of bookings', 'Party size, phone and notes', 'Not confirmed, confirmed, seated or cancelled', 'Shown on the table they are for'],
  },
  {
    id: 'khata',
    icon: 'khata',
    title: 'Khata, built in',
    summary: 'Put a bill on a customer\'s khata, take part payments, and send them their statement on WhatsApp. No more notebook.',
    points: ['Who owes what, at a glance', 'Part payments in cash or digital', 'Statement on WhatsApp or printed', 'Every change recorded with who made it'],
  },
  {
    id: 'customers',
    icon: 'customers',
    title: 'Customers who come back',
    summary: 'Every customer is saved with their number, their orders and what they spend. See who has not come back in a month and message them on WhatsApp.',
    points: ['Find anyone by number or name', 'Regulars, VIPs and slipping customers', 'Guests ask for WhatsApp offers from the QR menu', 'Import your existing list', 'WhatsApp receipts and messages'],
  },
  {
    id: 'offline',
    icon: 'offline',
    title: 'Works when the internet does not',
    summary: 'Orders keep going when the connection drops. They are saved on the device and sent when it is back, so a slow evening never stops the counter.',
    points: ['New orders offline, with their own numbers', 'Kitchen slips still print on a PC with Restora Print', 'Sends by itself when back online', 'Shows what is waiting to send', 'Works on slow mobile data'],
  },
  {
    id: 'team',
    icon: 'team',
    title: 'Your team, your branches',
    summary: 'Invite staff by email or WhatsApp and choose what each person can do. Run several branches, or several restaurants, and see all of them from one place.',
    points: ['Owner, manager, cashier, waiter and kitchen roles', 'An activity log of who changed what', 'Switch branch in one tap', 'One login for more than one restaurant'],
  },
  {
    id: 'pos',
    icon: 'pos',
    title: 'A POS for the counter',
    summary: 'Turn the tablet or laptop at the counter into a POS. Each person opens it with their own PIN, and it locks itself when nobody is using it.',
    points: ['A PIN for each member of staff', 'Locks itself when left alone', 'Pauses after too many wrong PINs', 'The same live orders as every phone'],
  },
  {
    id: 'menu',
    icon: 'menu',
    title: 'Menu, deals and stock',
    summary: 'Categories, dishes with half and full sizes, add-ons like raita or extra cheese, deals with choices, and a switch for "sold out today" per branch.',
    points: ['Deals and combos, with a choice of drink or side', 'Happy hours: sell a deal or dish only on chosen days and times', 'Sold out in one branch, not all', 'Hide a dish without deleting it', 'The same menu on the QR code'],
  },
  {
    id: 'payments',
    icon: 'payments',
    title: 'Payments and tax, the Pakistani way',
    summary: 'Cash, card, JazzCash, Easypaisa or bank transfer, with tax set per payment method. Today\'s sales, cash vs digital and what is still to collect.',
    points: ['Tax by payment method', 'Discounts with permission', 'Cash vs digital every day', 'Unpaid and khata kept apart'],
  },
  {
    id: 'appearance',
    icon: 'appearance',
    title: 'Your colours, day or night',
    summary: 'Pick one of six themes for your restaurant, each with a light and a dark version, and put your logo on the app and on receipts. Every screen your staff use matches.',
    points: ['Midnight Indigo, Saffron, Emerald, Ocean, Bordeaux, Onyx & Gold', 'Light, dark, or follow the device', 'Your logo in the app and on receipts', 'Order colours like paid and unpaid never change'],
  },
] as const;

export default FEATURES;
