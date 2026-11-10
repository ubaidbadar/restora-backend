import type { Context } from 'hono';
import { createHash } from 'node:crypto';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage, { type IWhatsAppMessage } from '../models/whatsapp_message';
import { verifyWhatsAppSignature } from '../utils/whatsapp_crypto';
import { whatsappPhone } from '../utils/whatsapp_phone';
import isPlatformWhatsAppNumber from '../utils/is_platform_whatsapp_number';
import { processWhatsAppMessage } from '../services/whatsapp_flow';
import notifyStaff from '../services/push';

type MetaMessage = {
  id?: string; from?: string; timestamp?: string; type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string; voice?: boolean };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { name?: string; address?: string };
  interactive?: { type?: string; list_reply?: { id?: string; title?: string }; button_reply?: { id?: string; title?: string } };
};
type MetaStatus = { id?: string; status?: string; timestamp?: string; recipient_id?: string };
type MetaChange = { value?: { metadata?: { phone_number_id?: string }; messages?: MetaMessage[]; statuses?: MetaStatus[] } };
const STATUS_PRECONDITIONS: Record<string, NonNullable<IWhatsAppMessage['deliveryStatus']>[]> = {
  sent: ['sent'],
  delivered: ['sent', 'delivered'],
  read: ['sent', 'delivered', 'read', 'failed'],
  failed: ['sent', 'failed'],
};
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
      if (!phoneNumberId || (!Array.isArray(value?.messages) && !Array.isArray(value?.statuses))) continue;
      if (isPlatformWhatsAppNumber(phoneNumberId)) {
        console.warn('[WhatsApp] Ignoring the reserved platform OTP number on the restaurant webhook');
        continue;
      }
      const connection = await runWithoutTenant(() =>
        WhatsAppConnection.findOne({ phoneNumberId }));
      if (!connection?.restaurantId || connection.status !== 'connected') {
        console.log('[WhatsApp] Ignoring webhook for disconnected or pending number', phoneNumberId);
        continue;
      }
      await runWithTenant(String(connection.restaurantId), async () => {
        // Meta sends delivery receipts in statuses[], not messages[]. Store
        // them on the original outbound record; do not regress read -> sent.
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          if (!status?.id || !status.status || !STATUS_PRECONDITIONS[status.status]) continue;
          const recipient = status.recipient_id ? whatsappPhone(status.recipient_id) : null;
          const seconds = Number(status.timestamp);
          const deliveryStatusAt = seconds > 0 && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
          const allowed = STATUS_PRECONDITIONS[status.status]!;
          try {
            await WhatsAppMessage.updateOne({
              metaMessageId: status.id, phoneNumberId, direction: 'outbound',
              ...(recipient ? { phone: recipient } : {}),
              $or: [{ deliveryStatus: { $exists: false } }, { deliveryStatus: { $in: allowed.slice(0, -1) } }],
            }, { $set: { deliveryStatus: status.status, deliveryStatusAt } });
          } catch (error) {
            failures++;
            console.error('[WhatsApp] Unable to persist delivery receipt', status.id,
              error instanceof Error ? error.message : 'unknown error');
          }
        }
        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          if (!message?.id || !message.from) continue;
          const phone = whatsappPhone(message.from);
          if (!phone) continue;
          const text = (
            message.text?.body || message.image?.caption || message.video?.caption ||
            message.document?.caption || message.location?.name || message.location?.address ||
            message.interactive?.list_reply?.title || message.interactive?.button_reply?.title || ''
          ).slice(0, 4096);
          const media = message.image || message.audio || message.video || message.document || message.sticker;
          // Meta marks voice notes with audio.voice; retain that distinction for inbox previews.
          const messageType = message.type === 'audio' && message.audio?.voice
            ? 'voice' : message.type || 'unknown';
          const interactiveId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
          const seconds = Number(message.timestamp);
          const receivedAt = seconds > 0 && Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date();
          const existing = await WhatsAppMessage.findOne({ metaMessageId: message.id });
          let inserted = false;
          if (!existing) {
            try {
              await WhatsAppMessage.create({
                branchId: connection.branchId, phoneNumberId, phone, from: message.from,
                direction: 'inbound', metaMessageId: message.id, messageType,
                text, interactiveId, mediaId: media?.id, mediaMimeType: media?.mime_type, receivedAt,
              });
              inserted = true;
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) { failures++; continue; }
            }
          }
          // A Meta retry must never send another alert for the same message.
          // The push payload intentionally excludes the customer number and message content.
          if (inserted) {
            console.info('[WhatsApp] Inbound message stored', {
              phoneNumberId, messageId: message.id, messageType,
            });
            const tag = 'wa-' + createHash('sha256').update(phoneNumberId + ':' + phone).digest('hex').slice(0, 26);
            void notifyStaff(String(connection.restaurantId), connection.branchId, 'orders:view', {
              title: 'New WhatsApp message',
              body: 'A customer sent your restaurant a WhatsApp message.',
              screen: 'whatsapp',
              tag,
            }).catch(error => console.error('[WhatsApp] Push alert failed',
              error instanceof Error ? error.message : 'unknown error'));
          }
          // Only one processor may act on a given Meta ID. Failed actions are retriable.
          const claimed = await WhatsAppMessage.findOneAndUpdate(
            { metaMessageId: message.id, direction: 'inbound', processedAt: { $exists: false }, $or: [{ processingAt: { $exists: false } }, { processingAt: { $lt: new Date(Date.now() - 90_000) } }] },
            { $set: { processingAt: new Date() } }, { returnDocument: 'after' });
          if (!claimed) continue;
          try {
            // An unprovisioned number may receive/store messages, but cannot send replies.
            if (connection.status === 'connected' && connection.accessTokenEncrypted) {
              await processWhatsAppMessage(connection, phone, {
                id: message.id, type: message.type, text: message.text, interactive: message.interactive,
              });
            }
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

