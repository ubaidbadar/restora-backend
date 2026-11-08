import type { Context } from 'hono';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import Customer from '../models/customer';
import { whatsappPhone } from '../utils/whatsapp_phone';
import { sendWhatsApp, WhatsAppSendError } from '../services/whatsapp_graph';

const WINDOW_MS = 24 * 60 * 60 * 1000;
export async function withinWhatsAppWindow(phoneNumberId: string, phone: string) {
  const latest = await WhatsAppMessage.findOne({ phoneNumberId, phone, direction: 'inbound' })
    .sort({ receivedAt: -1 }).select({ receivedAt: 1 });
  return !!latest && Date.now() - latest.receivedAt.getTime() < WINDOW_MS && latest.receivedAt.getTime() <= Date.now() + 60_000;
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
  const phones = conversations.map((x) => `+92${x.phone.slice(1)}`);
  const customers = await Customer.find({ phone: { $in: phones } }).select({ phone: 1, name: 1 });
  const names = new Map(customers.map((customer) => [customer.phone, customer.name]));
  return c.json(conversations.map((row) => ({ ...row, customerName: names.get(`+92${row.phone.slice(1)}`) || null })));
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
