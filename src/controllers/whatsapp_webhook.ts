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

/** Preserve Meta's existing verification handshake exactly. */
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
  if (!verifyWhatsAppSignature(rawBody, c.req.header('x-hub-signature-256'), appSecret)) {
    return c.json({ message: 'Invalid signature' }, 401);
  }
  let body: unknown;
  try { body = JSON.parse(rawBody); }
  catch { return c.json({ message: 'Invalid JSON' }, 400); }
  if (!isRecord(body) || body.object !== 'whatsapp_business_account') {
    return c.json({ message: 'Not a WhatsApp event' }, 400);
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
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
        console.log('[WhatsApp] Ignoring unmapped phone_number_id');
        continue;
      }
      await runWithTenant(String(connection.restaurantId), async () => {
        for (const message of messages) {
          if (!message?.id || !message?.from) continue;
          const phone = whatsappPhone(message.from);
          if (!phone) continue;
          const receivedAtRaw = message.timestamp ? Number(message.timestamp) * 1000 : Date.now();
          const receivedAt = Number.isFinite(receivedAtRaw) && receivedAtRaw > 0
            ? new Date(receivedAtRaw) : new Date();
          const record = {
            branchId: connection.branchId,
            phoneNumberId, phone, from: message.from,
            to: connection.phoneNumberDisplay, direction: 'inbound' as const,
            metaMessageId: message.id, messageType: message.type || 'unknown',
            text: message.text?.body || message.image?.caption || message.interactive?.list_reply?.title || message.interactive?.button_reply?.title,
            mediaId: message.image?.id,
            mediaMimeType: message.image?.mime_type,
            interactiveId: message.interactive?.list_reply?.id || message.interactive?.button_reply?.id,
            receivedAt,
          };
          // Unique index is authoritative; find-then-create alone races under webhook retries.
          const saved = await WhatsAppMessage.findOneAndUpdate(
            { metaMessageId: message.id }, { $setOnInsert: record },
            { upsert: true, returnDocument: 'after' }
          );
          if (!saved || saved.processedAt) continue;
          // Claim delivery with a recoverable lease; only one concurrent worker handles a message.
          const leaseBefore = new Date(Date.now() - 90_000);
          const claimed = await WhatsAppMessage.findOneAndUpdate(
            { _id: saved._id, processedAt: { $exists: false },
              $or: [{ processingAt: { $exists: false } }, { processingAt: { $lt: leaseBefore } }] },
            { $set: { processingAt: new Date() } }, { returnDocument: 'after' }
          );
          if (!claimed) continue;
          try {
            if (message.type === 'text' || message.type === 'interactive') {
              await processWhatsAppMessage(connection, phone, message);
            }
            await WhatsAppMessage.updateOne({ _id: saved._id }, {
              $set: { processedAt: new Date() }, $unset: { processingAt: '' },
            });
          } catch (error) {
            await WhatsAppMessage.updateOne({ _id: saved._id }, { $unset: { processingAt: '' } }).catch(() => {});
            console.error('[WhatsApp] Processing message failed:', (error as Error).message);
            // Meta must retry transient failures, including failed Graph sends.
            throw error;
          }
        }
      });
    }
  }
  return c.json({ received: true }, 200);
}

export default { verifyWebhook, receiveWebhook };
