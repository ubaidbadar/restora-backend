import type { Context } from 'hono';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import Customer from '../models/customer';
import Order from '../models/order';
import WhatsAppInvoiceDelivery from '../models/whatsapp_invoice_delivery';
import { whatsappPhone } from '../utils/whatsapp_phone';
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
  const filter: Record<string, unknown> = {};
  if (branchId) filter.branchId = branchId;
  const conversations = await WhatsAppMessage.aggregate([
    { $match: filter },
    { $sort: { receivedAt: -1 } },
    { $group: { _id: { phoneNumberId: '$phoneNumberId', phone: '$phone' }, last: { $first: '$$ROOT' }, count: { $sum: 1 } } },
    { $sort: { 'last.receivedAt': -1 } },
    { $limit: 100 },
    { $project: { _id: 0, phoneNumberId: '$_id.phoneNumberId', phone: '$_id.phone', last: 1, count: 1 } },
  ]);
  // Phase 1 stored only `from`, not normalized `phone`/message content.
  // Avoid crashing the inbox on those pre-migration rows.
  const normalized = conversations.map((row) => ({
    ...row, phone: whatsappPhone(String(row.phone || row.last?.from || '')),
  })).filter((row) => row.phone !== null);
  const phones = normalized.map((row) => `+92${row.phone!.slice(1)}`);
  const customers = await Customer.find({ phone: { $in: phones } }).select({ phone: 1, name: 1 });
  const names = new Map(customers.map((customer) => [customer.phone, customer.name]));
  return c.json(normalized.map((row) => ({
    ...row, customerName: names.get(`+92${row.phone!.slice(1)}`) || null,
  })));
}

export async function getConversation(c: Context) {
  const phone = whatsappPhone(c.req.param('phone') ?? '');
  if (!phone) return c.json({ message: 'Invalid Pakistani mobile number' }, 400);
  const phoneNumberId = c.req.query('phoneNumberId') || '';
  if (!phoneNumberId) return c.json({ message: 'phoneNumberId is required' }, 400);
  const branchId = c.get('branchId') as string | undefined;
  const filter: Record<string, unknown> = { phone, phoneNumberId };
  if (branchId) filter.branchId = branchId;
  const messages = await WhatsAppMessage.find(filter).sort({ receivedAt: -1 }).limit(100);
  return c.json({ messages: messages.reverse() });
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
    const saved = await WhatsAppMessage.create({
      branchId: connection.branchId, phoneNumberId, phone,
      from: connection.phoneNumberDisplay, to: phone, direction: 'outbound',
      metaMessageId, messageType: 'text', text: text.trim(), receivedAt: new Date(),
    });
    return c.json({ messageId: metaMessageId, message: saved }, 201);
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
