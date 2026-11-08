import MenuCategory from '../models/menu_category';
import MenuItem from '../models/menu_item';
import WhatsAppCart from '../models/whatsapp_cart';
import WhatsAppMessage from '../models/whatsapp_message';
import Order from '../models/order';
import DailyCounter from '../models/daily_counter';
import Customer from '../models/customer';
import Restaurant from '../models/restaurant';
import Branch from '../models/branch';
import { priceItems } from '../controllers/order';
import calcTotals from '../utils/calc_totals';
import runInTransaction from '../utils/transaction';
import dayKey from '../utils/day_key';
import onSale from '../utils/on_sale';
import { paginateWhatsApp, safeWhatsAppText } from '../utils/whatsapp_menu';
import { validateWhatsAppLLM } from '../utils/whatsapp_match';
import { sendWhatsApp, uploadWhatsAppPdf } from './whatsapp_graph';
import notifyStaff from './push';
import { invoiceMessage, invoicePdf } from '../utils/whatsapp_invoice';
import WhatsAppInvoiceDelivery from '../models/whatsapp_invoice_delivery';
import { withinWhatsAppWindow } from '../controllers/whatsapp_inbox';
import type { IWhatsAppConnection } from '../models/whatsapp_connection';
import type { IOrder } from '../models/order';

type Row = { id: string; title: string; description?: string };
type Inbound = { id: string; type?: string; text?: { body?: string }; interactive?: { type?: string; list_reply?: { id?: string }; button_reply?: { id?: string } } };
type MenuEntry = { id: string; name: string; categoryId: string; sizes: { id: string; name: string; price: number }[] };
const MAX_QTY = 10;
const MAX_LINES = 20;

function cartFilter(connection: IWhatsAppConnection, phone: string) {
  return { branchId: connection.branchId, phoneNumberId: connection.phoneNumberId, phone };
}
async function menu(connection: IWhatsAppConnection) {
  const [categories, items] = await Promise.all([
    MenuCategory.find({}).sort({ sortOrder: 1 }),
    MenuItem.find({ hidden: false }).sort({ createdAt: 1 }),
  ]);
  const available = items.filter((it) => !it.soldOutBranchIds.includes(connection.branchId) &&
    onSale(it) && (it.includes || []).every((part) => {
      const dish = items.find((candidate) => String(candidate._id) === part.itemId);
      return !!dish && !dish.soldOutBranchIds.includes(connection.branchId);
    }));
  return {
    categories: categories.map((cat) => ({ id: String(cat._id), name: cat.name })),
    items: available.filter((it) => it.sizes.length > 0).map((it): MenuEntry => ({
      id: String(it._id), categoryId: it.categoryId, name: it.name,
      sizes: it.sizes.map((s) => ({ id: String(s._id), name: s.name, price: s.price })),
    })),
  };
}
async function recordOutbound(connection: IWhatsAppConnection, phone: string, id: string, type: string, text?: string) {
  await WhatsAppMessage.create({
    branchId: connection.branchId, phoneNumberId: connection.phoneNumberId, phone,
    from: connection.phoneNumberDisplay, to: phone, direction: 'outbound',
    metaMessageId: id, messageType: type, text, receivedAt: new Date(),
  });
}
async function send(connection: IWhatsAppConnection, phone: string, payload: Record<string, unknown>, type: string, preview?: string) {
  if (!await withinWhatsAppWindow(connection.phoneNumberId, phone)) return null;
  const id = await sendWhatsApp(connection, phone, payload);
  await recordOutbound(connection, phone, id, type, preview);
  return id;
}
async function say(connection: IWhatsAppConnection, phone: string, text: string) {
  return send(connection, phone, { type: 'text', text: { body: text.slice(0, 4096) } }, 'text', text.slice(0, 4096));
}
async function choose(connection: IWhatsAppConnection, phone: string, body: string, button: string, rows: Row[]) {
  if (!rows.length) return say(connection, phone, 'Nothing available right now. Please contact the restaurant.');
  const limited = rows.slice(0, 10);
  await send(connection, phone, { type: 'interactive', interactive: {
    type: 'list', body: { text: body.slice(0, 1024) },
    action: { button: button.slice(0, 20), sections: [{ title: 'Options', rows: limited.map((row) => ({
      id: row.id.slice(0, 200), title: safeWhatsAppText(row.title), ...(row.description ? { description: row.description.slice(0, 72) } : {}),
    })) }] },
  } }, 'interactive', body);
}
async function showCategories(connection: IWhatsAppConnection, phone: string, page: number) {
  const live = await menu(connection);
  const { rows, next } = paginateWhatsApp(live.categories.filter((cat) => live.items.some((it) => it.categoryId === cat.id)), page);
  await choose(connection, phone, 'Choose a menu category', 'Categories',
    [...rows.map((cat) => ({ id: 'category:' + cat.id, title: cat.name })),
      ...(next === null ? [] : [{ id: 'cats:' + next, title: 'More categories' }])]);
}
async function showItems(connection: IWhatsAppConnection, phone: string, categoryId: string, page: number) {
  const live = await menu(connection);
  const category = live.categories.find((cat) => cat.id === categoryId);
  if (!category) return showCategories(connection, phone, 0);
  const { rows, next } = paginateWhatsApp(live.items.filter((it) => it.categoryId === categoryId), page);
  await choose(connection, phone, 'Dishes in ' + category.name, 'Choose dish',
    [...rows.map((it) => ({ id: 'dish:' + it.id, title: it.name, description: 'From Rs ' + Math.min(...it.sizes.map((s) => s.price)) })),
      ...(next === null ? [] : [{ id: 'dishes:' + categoryId + ':' + next, title: 'More dishes' }])]);
}
async function showSizes(connection: IWhatsAppConnection, phone: string, itemId: string) {
  await resetConfirmedCart(connection, phone);
  const live = await menu(connection);
  const item = live.items.find((it) => it.id === itemId);
  if (!item) return say(connection, phone, 'This dish is unavailable. Send MENU for current options.');
  // A dish may have many sizes; show paginated size variants when necessary.
  if (item.sizes.length === 1) {
    await WhatsAppCart.findOneAndUpdate(cartFilter(connection, phone),
      { $set: { pendingItemId: item.id, pendingSizeId: item.sizes[0]!.id, branchId: connection.branchId, phoneNumberId: connection.phoneNumberId, phone } },
      { upsert: true, returnDocument: 'after' });
    return showQuantities(connection, phone, item.name);
  }
  await choose(connection, phone, 'Choose size for ' + item.name, 'Sizes',
    item.sizes.slice(0, 9).map((size) => ({ id: 'size:' + item.id + ':' + size.id, title: size.name || 'Regular', description: 'Rs ' + size.price }))
    .concat(item.sizes.length > 9 ? [{ id: 'sizes:' + item.id + ':1', title: 'More sizes' }] : []));
}
async function showSizePage(connection: IWhatsAppConnection, phone: string, itemId: string, page: number) {
  const item = (await menu(connection)).items.find((it) => it.id === itemId);
  if (!item) return say(connection, phone, 'Dish is unavailable. Send MENU.');
  const { rows, next } = paginateWhatsApp(item.sizes, page);
  await choose(connection, phone, 'Choose size for ' + item.name, 'Sizes',
    rows.map((size) => ({ id: 'size:' + itemId + ':' + size.id, title: size.name || 'Regular', description: 'Rs ' + size.price }))
      .concat(next === null ? [] : [{ id: 'sizes:' + itemId + ':' + next, title: 'More sizes' }]));
}
async function showQuantities(connection: IWhatsAppConnection, phone: string, dish: string) {
  await choose(connection, phone, 'How many ' + dish + '?',
    'Quantity', Array.from({ length: MAX_QTY }, (_, i) => ({ id: 'qty:' + (i + 1), title: String(i + 1) })));
}
async function pricedCart(connection: IWhatsAppConnection, phone: string) {
  const cart = await WhatsAppCart.findOne(cartFilter(connection, phone));
  if (!cart?.items?.length) return { error: 'Your cart is empty. Send MENU to start.' } as const;
  const priced = await priceItems(cart.items.map((it) => ({ itemId: it.itemId, sizeId: it.sizeId, qty: it.qty, addonIds: [] })), connection.branchId);
  if (typeof priced === 'string') return { error: priced + '. Send MENU to update your cart.' } as const;
  return { priced, total: calcTotals(priced, 0, 0, 0).total, cart } as const;
}
async function summary(connection: IWhatsAppConnection, phone: string) {
  const result = await pricedCart(connection, phone);
  if ('error' in result) return say(connection, phone, result.error);
  const lines = result.priced.map((item) => item.qty + ' x ' + item.name + (item.sizeName ? ' (' + item.sizeName + ')' : '') + ': Rs ' + item.qty * item.price);
  const body = ['Your order:', ...lines, 'Total: Rs ' + result.total, 'Confirm to place the order, or Cancel to discard.'].join('\n');
  // WhatsApp buttons allow only 1024 body characters. Never hide priced lines or the total.
  // Do not authorize Confirm until the customer actually receives the priced summary.
  if (body.length > 1024) {
    const summaryId = await say(connection, phone, body);
    if (!summaryId) return;
  }
  const sentId = await send(connection, phone, { type: 'interactive', interactive: {
    type: 'button', body: { text: body.length > 1024 ? 'Total: Rs ' + result.total + '. Confirm or cancel this order.' : body },
    action: { buttons: [
      { type: 'reply', reply: { id: 'confirm', title: 'Confirm' } },
      { type: 'reply', reply: { id: 'cancel', title: 'Cancel' } },
      { type: 'reply', reply: { id: 'menu', title: 'Add more' } },
    ] },
  } }, 'interactive', body);
  if (!sentId) return;
  await WhatsAppCart.updateOne(
    { ...cartFilter(connection, phone), state: 'active', updatedAt: result.cart.updatedAt },
    { $set: { quoteFingerprint: JSON.stringify([result.priced, result.total]) } },
  );
}
function parsePage(value: string) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 && n <= 10000 ? n : 0;
}
async function llmParse(text: string, live: Awaited<ReturnType<typeof menu>>) {
  const key = process.env.WHATSAPP_LLM_API_KEY;
  const url = process.env.WHATSAPP_LLM_API_URL;
  const model = process.env.WHATSAPP_LLM_MODEL;
  if (!key || !url || !model) return { error: 'Please browse the menu with MENU; natural-language ordering is not configured.' } as const;
  // The LLM is untrusted. It receives only the text and this restaurant's current menu; server validates every returned ID.
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: 'Extract requested dishes and integer quantities only. Return JSON object with items:[{itemId, sizeId, qty, rawName, rawSize}], unmatched:[strings]. Copy rawName as the exact dish phrase from the customer text and rawSize as its exact size phrase if specified. Use only IDs from the supplied menu. Never guess, substitute or calculate prices. If a dish or size is ambiguous put the phrase in unmatched.' },
      { role: 'user', content: JSON.stringify({ text, menu: live.items }) },
    ] }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: 'Ordering assistant is temporarily unavailable. Send MENU to browse.' } as const;
  const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
  let parsed: unknown;
  try { parsed = JSON.parse(payload.choices?.[0]?.message?.content || ''); }
  catch { return { error: 'I could not understand that order. Please send MENU.' } as const; }
  if (!parsed || typeof parsed !== 'object') return { error: 'Please send MENU.' } as const;
  const value = parsed as { items?: unknown; unmatched?: unknown };
  const checked = validateWhatsAppLLM(text, live.items, value.items, value.unmatched);
  if (!checked.selections.length && !checked.unmatched.length)
    return { error: 'No dishes found. Send MENU to browse.' } as const;
  return checked as { selections: { itemId: string; sizeId: string; qty: number }[]; unmatched: string[] };
}
async function confirm(connection: IWhatsAppConnection, phone: string, confirmMessageId: string) {
  const filter = cartFilter(connection, phone);
  const cart = await WhatsAppCart.findOne(filter);
  if (!cart?.items.length) return say(connection, phone, 'There is no unconfirmed order. Send MENU to start.');
  if (cart.state === 'confirmed') return say(connection, phone, 'This order was already confirmed. Send MENU to start a new order.');
  if (cart.state === 'confirming') return say(connection, phone, 'Your order is already being processed.');
  if (!cart.quoteFingerprint) return say(connection, phone, 'Review the priced CART and tap its Confirm button before ordering.');
  const pricedBeforeClaim = await priceItems(cart.items.map((it) =>
    ({ itemId: it.itemId, sizeId: it.sizeId, qty: it.qty, addonIds: [] })), connection.branchId);
  if (typeof pricedBeforeClaim === 'string') {
    return say(connection, phone, pricedBeforeClaim + '. Your order was NOT placed. Send MENU to update your cart.');
  }
  const approvedFingerprint = JSON.stringify([pricedBeforeClaim, calcTotals(pricedBeforeClaim, 0, 0, 0).total]);
  if (cart.quoteFingerprint !== approvedFingerprint) {
    await WhatsAppCart.updateOne({ ...filter, state: 'active', _id: cart._id }, { $unset: { quoteFingerprint: '' } });
    await say(connection, phone, 'Menu prices changed. Please review the new summary and tap Confirm again.');
    return summary(connection, phone);
  }
  // Claim the exact cart revision and exact prices that the customer approved.
  const claimed = await WhatsAppCart.findOneAndUpdate(
    { ...filter, state: 'active', updatedAt: cart.updatedAt, quoteFingerprint: approvedFingerprint },
    { $set: { state: 'confirming' } }, { returnDocument: 'after' });
  if (!claimed) return say(connection, phone, 'Your cart changed. Review it again before confirming.');
  const clientId = 'wa:' + String(claimed._id) + ':' + claimed.generation;
  let order: IOrder;
  let created = false;
  try {
    const existing = await Order.findOne({ clientId });
    if (existing) order = existing;
    else {
      const outstanding = await Order.countDocuments({ branchId: connection.branchId, whatsappPhone: phone, status: 'pending' });
      if (outstanding >= 3) throw new Error('Your earlier orders are waiting for staff. Please contact the restaurant.');
      // Recompute price with the exact live menu; never accept LLM-provided prices.
      const priced = await priceItems(claimed.items.map((it) =>
        ({ itemId: it.itemId, sizeId: it.sizeId, qty: it.qty, addonIds: [] })), connection.branchId);
      if (typeof priced === 'string') throw new Error(priced);
      const totals = calcTotals(priced, 0, 0, 0);
      if (JSON.stringify([priced, totals.total]) !== cart.quoteFingerprint) {
        throw new Error('The menu prices changed; review your cart and confirm the new total');
      }
      if (JSON.stringify([priced, totals.total]) !== approvedFingerprint)
        throw new Error('Menu price or availability changed. Review CART and confirm the new amount.');
      const normalizedPhone = '+92' + phone.slice(1);
      const customer = await Customer.findOneAndUpdate(
        { phone: normalizedPhone },
        { $setOnInsert: { name: 'WhatsApp Guest', phone: normalizedPhone, source: 'whatsapp' } },
        { upsert: true, returnDocument: 'after' }
      );
      if (!customer) throw new Error('Could not save customer');
      try {
        order = await runInTransaction(async (session) => {
          const prior = await Order.findOne({ clientId }).session(session || null);
          if (prior) return prior;
          const today = dayKey();
          const counter = await DailyCounter.findOneAndUpdate(
            { restaurantId: connection.restaurantId, branchId: connection.branchId, dayKey: today },
            { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session });
          const [saved] = await Order.create([{
            dailyToken: counter?.seq || 1, branchId: connection.branchId, type: 'takeaway', status: 'pending',
            items: priced, subtotal: totals.subtotal, discount: 0, taxRate: 0, tax: 0, deliveryFee: 0,
            total: totals.total, paymentStatus: 'unpaid', dayKey: today, clientId,
            whatsappPhone: phone, whatsappPhoneNumberId: connection.phoneNumberId,
            customerId: String(customer._id),
            customer: { _id: String(customer._id), name: customer.name, phone: customer.phone },
            takenBy: 'Guest (WhatsApp)',
          }], { session });
          if (!saved) throw new Error('Could not save order');
          created = true;
          return saved;
        });
      } catch (error) {
        if ((error as { code?: number }).code === 11000) {
          const duplicate = await Order.findOne({ clientId });
          if (duplicate) order = duplicate;
          else throw error;
        } else throw error;
      }
    }
    await WhatsAppCart.updateOne({ ...filter, state: 'confirming' },
      { $set: { state: 'confirmed', orderId: String(order._id), items: [] },
        $unset: { pendingItemId: '', pendingSizeId: '' } });
  } catch (error) {
    await WhatsAppCart.updateOne({ ...filter, state: 'confirming' }, { $set: { state: 'active' }, $unset: { quoteFingerprint: '' } });
    await say(connection, phone, 'Order not confirmed: ' + (error instanceof Error ? error.message : 'Please try again') + '. Send CART for a fresh summary.');
    return;
  }
  if (created) {
    notifyStaff(String(connection.restaurantId), connection.branchId, 'orders:view', {
      title: 'WhatsApp order #' + order.dailyToken,
      body: order.items.map((it) => it.qty + ' x ' + it.name).join(', '),
      screen: 'orders', tag: 'order-' + String(order._id),
    }).catch((error) => console.error('[WhatsApp] Staff notification failed:', error));
  }
  await say(connection, phone, 'Order #' + order.dailyToken + ' received. Status: ' + order.status + '.');
  try { await deliverInvoice(connection, phone, order); }
  catch (error) { console.error('[WhatsApp] Invoice send failed:', error instanceof Error ? error.message : 'unknown error'); }
}
async function resetConfirmedCart(connection: IWhatsAppConnection, phone: string) {
  const filter = cartFilter(connection, phone);
  await WhatsAppCart.findOneAndUpdate({ ...filter, state: 'confirmed' },
    { $set: { state: 'active', items: [] },
      $unset: { orderId: '', pendingItemId: '', pendingSizeId: '' },
      $inc: { generation: 1 } });
}
export async function deliverInvoice(
  connection: IWhatsAppConnection, phone: string, order: IOrder, stage: 'confirmed' | 'completed' = 'confirmed'
) {
  if (order.whatsappPhone !== phone || order.whatsappPhoneNumberId !== connection.phoneNumberId)
    throw new Error('Invoice recipient/number must match the original WhatsApp order');
  const orderId = String(order._id);
  const key = { orderId, stage };
  await WhatsAppInvoiceDelivery.findOneAndUpdate(key,
    { $setOnInsert: { ...key, phone, phoneNumberId: connection.phoneNumberId, status: 'pending' } },
    { upsert: true, returnDocument: 'after' });
  if (!await withinWhatsAppWindow(connection.phoneNumberId, phone)) {
    await WhatsAppInvoiceDelivery.updateOne({ ...key, status: { $ne: 'sent' } }, { $set: { status: 'template_required' } });
    return { templateRequired: true };
  }
  const attempt = await WhatsAppInvoiceDelivery.findOneAndUpdate(
    { ...key, status: { $in: ['pending', 'failed', 'template_required'] } },
    { $set: { status: 'sending' }, $unset: { lastError: '' } },
    { returnDocument: 'after' }
  );
  if (!attempt) return { templateRequired: false };
  try {
    const [restaurant, branch] = await Promise.all([
      Restaurant.findById(connection.restaurantId), Branch.findById(connection.branchId),
    ]);
    const name = restaurant?.name || branch?.name || 'Restaurant';
    if (!attempt.billMessageId) {
      const billId = await say(connection, phone, invoiceMessage(order, name));
      if (!billId) throw new Error('Customer service window expired before bill send');
      await WhatsAppInvoiceDelivery.updateOne(key, { $set: { billMessageId: billId } });
    }
    if (!await withinWhatsAppWindow(connection.phoneNumberId, phone)) {
      await WhatsAppInvoiceDelivery.updateOne(key, { $set: { status: 'template_required' } });
      return { templateRequired: true };
    }
    const pdf = invoicePdf(order, name, branch?.address);
    const mediaId = await uploadWhatsAppPdf(connection, pdf, 'invoice-' + order.dailyToken + '.pdf');
    if (!await withinWhatsAppWindow(connection.phoneNumberId, phone)) {
      await WhatsAppInvoiceDelivery.updateOne(key, { $set: { status: 'template_required' } });
      return { templateRequired: true };
    }
    const documentId = await send(connection, phone, {
      type: 'document', document: { id: mediaId, filename: 'invoice-' + order.dailyToken + '.pdf' },
    }, 'document', 'Invoice #' + order.dailyToken);
    if (!documentId) throw new Error('Customer service window expired before invoice send');
    await WhatsAppInvoiceDelivery.updateOne(key, { $set: { documentMessageId: documentId, status: 'sent', sentAt: new Date() } });
    return { templateRequired: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invoice send failed';
    await WhatsAppInvoiceDelivery.updateOne(key, { $set: { status: 'failed', lastError: message.slice(0, 300) } });
    throw error;
  }
}
export async function processWhatsAppMessage(connection: IWhatsAppConnection, phone: string, message: Inbound) {
  const action = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id || '';
  const text = (message.text?.body || '').trim();
  const lower = text.toLowerCase();
  if (action === 'menu' || /^(menu|hi|hello|start)$/i.test(text)) return showCategories(connection, phone, 0);
  if (action === 'cancel' || lower === 'cancel') {
    await WhatsAppCart.deleteOne(cartFilter(connection, phone));
    return say(connection, phone, 'Cart cleared. Send MENU to begin again.');
  }
  if (action === 'confirm') return confirm(connection, phone, message.id);
  if (action.startsWith('cats:')) return showCategories(connection, phone, parsePage(action.slice(5)));
  if (action.startsWith('category:')) return showItems(connection, phone, action.slice(9), 0);
  if (action.startsWith('dishes:')) {
    const parts = action.split(':');
    return showItems(connection, phone, parts[1] || '', parsePage(parts[2] || '0'));
  }
  if (action.startsWith('dish:')) return showSizes(connection, phone, action.slice(5));
  if (action.startsWith('sizes:')) {
    const parts = action.split(':');
    return showSizePage(connection, phone, parts[1] || '', parsePage(parts[2] || '0'));
  }
  if (action.startsWith('size:')) {
    await resetConfirmedCart(connection, phone);
    const [, itemId, sizeId] = action.split(':');
    const entry = (await menu(connection)).items.find((it) => it.id === itemId);
    if (!entry || !entry.sizes.some((s) => s.id === sizeId)) return say(connection, phone, 'That size is unavailable. Send MENU.');
    await WhatsAppCart.findOneAndUpdate(cartFilter(connection, phone),
      { $set: { pendingItemId: itemId, pendingSizeId: sizeId, ...cartFilter(connection, phone) } },
      { upsert: true });
    return showQuantities(connection, phone, entry.name);
  }
  if (action.startsWith('qty:')) {
    const qty = Number(action.slice(4));
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return say(connection, phone, 'Choose a quantity from 1 to 10.');
    const cart = await WhatsAppCart.findOne(cartFilter(connection, phone));
    if (!cart?.pendingItemId || !cart.pendingSizeId) return say(connection, phone, 'Please choose a dish first. Send MENU.');
    const entry = (await menu(connection)).items.find((it) => it.id === cart.pendingItemId);
    if (!entry?.sizes.some((s) => s.id === cart.pendingSizeId)) return say(connection, phone, 'That dish is no longer available. Send MENU.');
    const items = [...cart.items];
    const existing = items.find((it) => it.itemId === cart.pendingItemId && it.sizeId === cart.pendingSizeId);
    if (existing) existing.qty += qty;
    else items.push({ itemId: cart.pendingItemId, sizeId: cart.pendingSizeId, qty });
    if (items.length > MAX_LINES || items.some((it) => it.qty > 20)) return say(connection, phone, 'Maximum 20 lines and 20 of each dish per order.');
    await WhatsAppCart.updateOne(cartFilter(connection, phone), { $set: { items }, $unset: { pendingItemId: '', pendingSizeId: '' } });
    return summary(connection, phone);
  }
  if (lower === 'cart') return summary(connection, phone);
  if (text) {
    await resetConfirmedCart(connection, phone);
    const live = await menu(connection);
    const parsed = await llmParse(text, live);
    if ('error' in parsed) return say(connection, phone, parsed.error);
    if (parsed.unmatched.length) {
      return say(connection, phone, 'Please clarify these dishes or sizes (nothing was ordered): ' + parsed.unmatched.join(', ') + '. Send MENU to browse.');
    }
    if (parsed.selections.length > MAX_LINES) return say(connection, phone, 'Too many dishes. Please use MENU.');
    await WhatsAppCart.findOneAndUpdate(cartFilter(connection, phone),
      { $set: { ...cartFilter(connection, phone), items: parsed.selections }, $unset: { pendingItemId: '', pendingSizeId: '' } },
      { upsert: true });
    return summary(connection, phone);
  }
}
