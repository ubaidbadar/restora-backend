import type { Context } from 'hono';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import WhatsAppRead from '../models/whatsapp_read';
import Customer from '../models/customer';
import Order from '../models/order';
import WhatsAppInvoiceDelivery from '../models/whatsapp_invoice_delivery';
import { whatsappPhone, graphPhone } from '../utils/whatsapp_phone';
import { isWhatsAppWindowOpen } from '../utils/whatsapp_window';
import { sendWhatsApp, WhatsAppSendError } from '../services/whatsapp_graph';

export async function withinWhatsAppWindow(phoneNumberId: string, phone: string) {
  const latest = await WhatsAppMessage.findOne({ phoneNumberId, phone, direction: 'inbound' })
    .sort({ receivedAt: -1 }).select({ receivedAt: 1 });
  return isWhatsAppWindowOpen(latest?.receivedAt);
}
export const WINDOW_ERROR = 'The 24-hour WhatsApp customer-service window is closed. Use the template-message route instead; no message was sent.';

export async function listConversations(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  // Historical Phase 1 records had no branchId/phone. Their receiving Meta
  // phone_number_id is unique and remains the safe branch routing key.
  const connected = branchId ? await WhatsAppConnection.find({ branchId }).select({ phoneNumberId: 1 }) : [];
  const filter: Record<string, unknown> = branchId
    ? { phoneNumberId: { $in: connected.map((entry) => entry.phoneNumberId) } }
    : {};
  const conversations = await WhatsAppMessage.aggregate([
    { $match: filter },
    { $sort: { receivedAt: -1 } },
    { $group: {
      _id: { phoneNumberId: '$phoneNumberId', phone: { $ifNull: ['$phone', '$from'] } },
      last: { $first: '$ROOT' },
      count: { $sum: 1 },
      lastInboundAt: { $max: { $cond: [{ $eq: ['$direction', 'inbound'] }, '$receivedAt', null] } },
    } },
    { $sort: { 'last.receivedAt': -1 } },
    { $limit: 100 },
    { $project: { _id: 0, phoneNumberId: '$_id.phoneNumberId', phone: '$_id.phone', last: 1, count: 1, lastInboundAt: 1 } },
  ]);
  // Phase 1 stored only `from`, not normalized `phone`/message content.
  // Avoid crashing the inbox on those pre-migration rows.
  const normalized = conversations.map((row) => ({
    ...row, phone: whatsappPhone(String(row.phone || row.last?.from || '')),
  })).filter((row) => row.phone !== null);
  // Coalesce legacy (Meta-format) and current (03-format) threads for one customer.
  const merged = new Map<string, (typeof normalized)[number]>();
  for (const row of normalized) {
    const key = row.phoneNumberId + ':' + row.phone;
    const earlier = merged.get(key);
    if (!earlier) merged.set(key, row);
    else {
      earlier.count += row.count;
      if (row.lastInboundAt && (!earlier.lastInboundAt || new Date(row.lastInboundAt).getTime() > new Date(earlier.lastInboundAt).getTime()))
        earlier.lastInboundAt = row.lastInboundAt;
      if (new Date(row.last?.receivedAt).getTime() > new Date(earlier.last?.receivedAt).getTime()) earlier.last = row.last;
    }
  }
  const threads = [...merged.values()].sort((a, b) =>
    new Date(b.last?.receivedAt).getTime() - new Date(a.last?.receivedAt).getTime()).slice(0, 100);
  const phones = threads.map((row) => `+92${row.phone!.slice(1)}`);
  const customers = await Customer.find({ phone: { $in: phones } }).select({ phone: 1, name: 1 });
  const names = new Map(customers.map((customer) => [customer.phone, customer.name]));
  const reads = await WhatsAppRead.find({ userId: c.get('user').id }).select({
    phoneNumberId: 1, phone: 1, readThrough: 1,
  });
  const readThrough = new Map(reads.map((row) => [`${row.phoneNumberId}:${row.phone}`, row.readThrough.getTime()]));
  return c.json(threads.map((row) => ({
    ...row,
    customerName: names.get(`+92${row.phone!.slice(1)}`) || null,
    unread: Boolean(row.lastInboundAt) && new Date(row.lastInboundAt).getTime() >
      (readThrough.get(`${row.phoneNumberId}:${row.phone}`) ?? 0),
    replyWindowOpen: isWhatsAppWindowOpen(row.lastInboundAt),
  })));
}

export async function getConversation(c: Context) {
  const phone = whatsappPhone(c.req.param('phone') ?? '');
  if (!phone) return c.json({ message: 'Invalid Pakistani mobile number' }, 400);
  const phoneNumberId = c.req.query('phoneNumberId') || '';
  if (!phoneNumberId) return c.json({ message: 'phoneNumberId is required' }, 400);
  const branchId = c.get('branchId') as string | undefined;
  // Explicitly authorize this receiving number before reading any legacy rows.
  const connection = await WhatsAppConnection.findOne({ phoneNumberId, ...(branchId ? { branchId } : {}) });
  if (!connection) return c.json({ message: 'Restaurant WhatsApp number not found' }, 404);
  const from = graphPhone(phone);
  const messages = await WhatsAppMessage.find({
    phoneNumberId, $or: [{ phone }, { from }, { from: '+' + from }, { from: phone }],
  }).sort({ receivedAt: -1 }).limit(100);
  return c.json({ messages: messages.reverse() });
}

/** Mark only messages already seen in the opened thread (no future-read timestamp). */
export async function readConversation(c: Context) {
  const phone = whatsappPhone(c.req.param('phone') ?? '');
  if (!phone) return c.json({ message: 'Invalid Pakistani mobile number' }, 400);
  const { phoneNumberId, messageId } = c.get('validatedJson') as { phoneNumberId: string; messageId: string };
  const branchId = c.get('branchId') as string | undefined;
  const connection = await WhatsAppConnection.findOne({ phoneNumberId, ...(branchId ? { branchId } : {}) });
  if (!connection) return c.json({ message: 'Restaurant WhatsApp number not found' }, 404);
  const from = graphPhone(phone);
  const message = await WhatsAppMessage.findOne({
    phoneNumberId, metaMessageId: messageId, direction: 'inbound',
    $or: [{ phone }, { from }, { from: '+' + from }, { from: phone }],
  }).select({ receivedAt: 1 });
  if (!message) return c.json({ message: 'Message not found in this conversation' }, 404);
  await WhatsAppRead.updateOne({
    userId: c.get('user').id, phoneNumberId, phone,
  }, {
    $set: { branchId: connection.branchId },
    $max: { readThrough: message.receivedAt },
  }, { upsert: true });
  return c.json({ phoneNumberId, phone, readThrough: message.receivedAt });
}

export async function replyToConversation(c: Context) {
  const { phoneNumberId, text } = c.get('validatedJson') as { phoneNumberId: string; text: string };
  const phone = whatsappPhone(c.req.param('phone') ?? '');
  if (!phone) return c.json({ message: 'Invalid Pakistani mobile number' }, 400);
  const branchId = c.get('branchId') as string | undefined;
  const connection = await WhatsAppConnection.findOne({ phoneNumberId, ...(branchId ? { branchId } : {}) });
  if (!connection) return c.json({ message: 'Connected restaurant WhatsApp number not found' }, 404);
  if (!(await withinWhatsAppWindow(phoneNumberId, phone))) return c.json({ message: WINDOW_ERROR, code: 'template_required' }, 409);
  try {
    const metaMessageId = await sendWhatsApp(connection, phone, { type: 'text', text: { body: text.trim() } });
    try {
      const saved = await WhatsAppMessage.create({
        branchId: connection.branchId, phoneNumberId, phone,
        from: connection.phoneNumberDisplay, to: phone, direction: 'outbound',
        metaMessageId, messageType: 'text', text: text.trim(), receivedAt: new Date(),
      });
      return c.json({ messageId: metaMessageId, message: saved }, 201);
    } catch (error) {
      // Meta has already accepted the reply. Do not tell staff to resend it.
      console.error('[WhatsApp] Staff reply accepted by Meta but inbox logging failed',
        metaMessageId, error instanceof Error ? error.message : 'unknown error');
      return c.json({ messageId: metaMessageId, sent: true, logged: false }, 202);
    }
  } catch (error) {
    if (error instanceof WhatsAppSendError) return c.json({ message: error.message }, error.status as 409 | 400 | 502);
    throw error;
  }
}

// Per-restaurant settings; never expose the encrypted Graph API token to the browser.
export async function listWhatsAppConnections(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  const connections = await WhatsAppConnection.find(branchId ? { branchId } : {})
    .select({ accessTokenEncrypted: 0 });
  return c.json(connections);
}
export async function updateWhatsAppConnection(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  const id = c.req.param('id') ?? '';
  const { invoiceOnComplete } = c.get('validatedJson') as { invoiceOnComplete: boolean };
  const updated = await WhatsAppConnection.findOneAndUpdate(
    { _id: id, ...(branchId ? { branchId } : {}) },
    { $set: { invoiceOnComplete } }, { returnDocument: 'after' }
  ).select({ accessTokenEncrypted: 0 }).catch(() => null);
  if (!updated) return c.json({ message: 'WhatsApp connection not found' }, 404);
  return c.json(updated);
}

/** Inspect deliveries that failed or need an approved template; no template is sent here. */
export async function listWhatsAppInvoices(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  const connections = await WhatsAppConnection.find(branchId ? { branchId } : {}).select({ phoneNumberId: 1 });
  const ids = connections.map((connection) => connection.phoneNumberId);
  const status = c.req.query('status');
  const filter: Record<string, unknown> = { phoneNumberId: { $in: ids } };
  if (status && ['pending', 'sending', 'sent', 'failed', 'template_required'].includes(status)) filter.status = status;
  return c.json(await WhatsAppInvoiceDelivery.find(filter).sort({ createdAt: -1 }).limit(100));
}

/** Safe manual retry: only the original WhatsApp phone and sending number are ever used. */
export async function retryWhatsAppInvoice(c: Context) {
  const order = await Order.findById(c.req.param('orderId') ?? '').catch(() => null);
  if (!order?.whatsappPhone || !order.whatsappPhoneNumberId)
    return c.json({ message: 'This order did not originate from WhatsApp' }, 404);
  const branchId = c.get('branchId') as string | undefined;
  if (branchId && order.branchId !== branchId) return c.json({ message: 'Order not in this branch' }, 404);
  const connection = await WhatsAppConnection.findOne({
    phoneNumberId: order.whatsappPhoneNumberId, branchId: order.branchId,
  });
  if (!connection) return c.json({ message: 'Original WhatsApp sending number not connected' }, 404);
  const { stage = 'confirmed' } = c.get('validatedJson') as { stage?: 'confirmed' | 'completed' };
  const { deliverInvoice } = await import('../services/whatsapp_flow');
  try {
    const result = await deliverInvoice(connection, order.whatsappPhone, order, stage);
    if (result.templateRequired) return c.json({ message: WINDOW_ERROR, code: 'template_required' }, 409);
    return c.json({ success: true, stage });
  } catch (error) {
    return c.json({ message: error instanceof Error ? error.message : 'WhatsApp invoice failed' }, 502);
  }
}
