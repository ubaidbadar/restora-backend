import type { Context } from 'hono';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import { verifyWhatsAppSignature } from '../utils/whatsapp_crypto';
import { whatsappPhone } from '../utils/whatsapp_phone';
import { processWhatsAppMessage } from '../services/whatsapp_flow';

type MetaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  interactive?: {
    type?: string;
    list_reply?: { id?: string; title?: string };
    button_reply?: { id?: string; title?: string };
  };
};
type MetaChangeValue = {
  metadata?: { phone_number_id?: string };
  messages?: MetaMessage[];
};
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Keep Phase 1 handshake behavior intact, including the mismatch error. */
export async function verifyWebhook(c: Context) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    return c.text(challenge, 200);
  }
  return c.json({ message: 'Verification token mismatch' }, 403);
}
export async function receiveWebhook(c: Context) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.error('[WhatsApp] WHATSAPP_APP_SECRET is not configured; refusing webhook POST');
    return c.json({ message: 'WhatsApp webhook is not configured' }, 503);
  }
  const rawBody = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    return c.json({ message: 'Invalid signature' }, 401);
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return c.json({ message: 'Invalid JSON' }, 400); }
  if (!isRecord(body) || body.object !== 'whatsapp_business_account') {
    return c.json({ message: 'Not a WhatsApp event' }, 400);
  }
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let failed = false;
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value as MetaChangeValue;
      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      if (!phoneNumberId || !messages.length) continue;
      const connection = await runWithoutTenant(() =>
        WhatsAppConnection.findOne({ phoneNumberId, status: { $ne: 'disconnected' } })
      );
      if (!connection?.restaurantId) {
        console.log('[WhatsApp] Ignoring unmapped number ' + phoneNumberId);
        continue;
      }
      await runWithTenant(String(connection.restaurantId), async () => {
        for (const message of messages) {
          if (!message?.id || !message?.from) continue;
          const phone = whatsappPhone(message.from);
          if (!phone) {
            console.error('[WhatsApp] Ignoring invalid customer phone format');
            continue;
          }
          const timestamp = Number(message.timestamp);
          const receivedAt = message.timestamp && Number.isFinite(timestamp) && timestamp > 0
            ? new Date(timestamp * 1000) : new Date();
          const text = message.type === 'text' ? message.text?.body
            : message.type === 'image' ? message.image?.caption
            : message.interactive?.list_reply?.title || message.interactive?.button_reply?.title;
          const interactiveId = message.interactive?.list_reply?.id || message.interactive?.button_reply?.id;
          let stored = await WhatsAppMessage.findOne({ metaMessageId: message.id });
          if (!stored) {
            try {
              stored = await WhatsAppMessage.create({
                branchId: connection.branchId, phoneNumberId, phone, from: message.from,
                direction: 'inbound', metaMessageId: message.id, messageType: message.type || 'unknown',
                ...(text ? { text } : {}), ...(interactiveId ? { interactiveId } : {}),
                ...(message.image?.id ? { mediaId: message.image.id } : {}),
                ...(message.image?.mime_type ? { mediaMimeType: message.image.mime_type } : {}),
                receivedAt,
              });
            } catch (error) {
              if ((error as { code?: number }).code !== 11000) throw error;
              stored = await WhatsAppMessage.findOne({ metaMessageId: message.id });
            }
          }
          if (!stored || stored.processedAt) continue;
          try {
            if (connection.status === 'connected' && connection.accessTokenEncrypted) {
              await processWhatsAppMessage(connection, phone, message);
            }
            // Mark handled after processing; retry of already processed Meta ID is a no-op.
            await WhatsAppMessage.updateOne({ _id: stored._id, processedAt: { $exists: false } }, { $set: { processedAt: new Date() } });
          } catch (error) {
            failed = true;
            console.error('[WhatsApp] Failed to process inbound message:', (error as Error).message);
          }
        }
      });
    }
  }
  // Fail the webhook only when a valid message failed to process, so Meta can retry.
  return failed ? c.json({ message: 'Message processing temporarily unavailable' }, 503) : c.json({ received: true }, 200);
}
export default { verifyWebhook, receiveWebhook };
