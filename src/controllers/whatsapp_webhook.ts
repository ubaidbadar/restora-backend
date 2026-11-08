import type { Context } from 'hono';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import { verifyWhatsAppSignature } from '../utils/whatsapp_crypto';
import { whatsappPhone } from '../utils/whatsapp_phone';
import { processWhatsAppMessage } from '../services/whatsapp_flow';

type MetaMessage = {
  id?: string; from?: string; timestamp?: string; type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  interactive?: { type?: string; list_reply?: { id?: string; title?: string }; button_reply?: { id?: string; title?: string } };
};
type MetaChange = { value?: { metadata?: { phone_number_id?: string }; messages?: MetaMessage[] } };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export async function verifyWebhook(c: Context) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && challenge) return c.text(challenge, 200);
  return c.json({ message: 'Verification token mismatch' }, 403);
}
export async function receiveWebhook(c: Context) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('[WhatsApp] WHATSAPP_APP_SECRET not configured');
    return c.json({ message: 'WhatsApp webhook is not configured' }, 503);
  }
  const rawBody = await c.req.text();
  if (!verifyWhatsAppSignature(rawBody, c.req.header('x-hub-signature-256'), secret))
    return c.json({ message: 'Invalid signature' }, 401);
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return c.json({ message: 'Invalid JSON' }, 400); }
  if (!isRecord(parsed) || parsed.object !== 'whatsapp_business_account')
    return c.json({ message: 'Not a WhatsApp event' }, 400);
  const entries = Array.isArray(parsed.entry) ? parsed.entry : [];
  let failures = 0;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes as MetaChange[]) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !Array.isArray(value?.messages)) continue;
      const connection = await runWithoutTenant(() =>
        WhatsAppConnection.findOne({ phoneNumberId, status: { $ne: 'disconnected' } }));
      if (!connection?.restaurantId) {
        console.log('[WhatsApp] Ignoring message for unconnected phone_number_id', phoneNumberId);
        continue;
      }
      await runWithTenant(String(connection.restaurantId), async () => {
        for (const message of value.messages!) {
          if (!message?.id || !message.from) continue;
          const phone = whatsappPhone(message.from) || message.from.replace(/\D/g, '').slice(0, 24);
          if (!phone) continue;
          const text = (
            message.text?.body || message.image?.caption ||
            message.interactive?.list_reply?.title || message.interactive?.button_reply?.title || ''
          ).slice(0, 4096);
          const interactiveId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
          const seconds = Number(message.timestamp);
          const receivedAt = seconds > 0 && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
          const existing = await WhatsAppMessage.findOne({ metaMessageId: message.id });
          if (!existing) {
            try {
              await WhatsAppMessage.create({
                branchId: connection.branchId, phoneNumberId, phone, from: message.from,
                direction: 'inbound', metaMessageId: message.id, messageType: message.type || 'unknown',
                text, interactiveId, mediaId: message.image?.id, mediaMimeType: message.image?.mime_type, receivedAt,
              });
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) { failures++; continue; }
            }
          }
          // Only one processor may act on a given Meta ID. Failed actions are retriable.
          const claimed = await WhatsAppMessage.findOneAndUpdate(
            { metaMessageId: message.id, direction: 'inbound', processedAt: { $exists: false }, processingAt: { $exists: false } },
            { $set: { processingAt: new Date() } }, { returnDocument: 'after' });
          if (!claimed) continue;
          try {
            await processWhatsAppMessage(connection, phone, {
              id: message.id, type: message.type, text: message.text, interactive: message.interactive,
            });
            await WhatsAppMessage.updateOne({ _id: claimed._id }, { $set: { processedAt: new Date() }, $unset: { processingAt: '' } });
          } catch (error) {
            failures++;
            console.error('[WhatsApp] Message processing failed', message.id, error instanceof Error ? error.message : 'unknown error');
            await WhatsAppMessage.updateOne({ _id: claimed._id }, { $unset: { processingAt: '' } });
          }
        }
      });
    }
  }
  // Meta retries when processing fails. Dedupe records make replay safe.
  return failures ? c.json({ message: 'WhatsApp message processing temporarily unavailable' }, 503) : c.json({ received: true }, 200);
}
export default { verifyWebhook, receiveWebhook };
