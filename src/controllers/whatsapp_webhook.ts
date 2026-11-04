import type { Context } from 'hono';
import { runWithTenant, runWithoutTenant } from '../middlewares/tenant_context';
import WhatsAppConnection from '../models/whatsapp_connection';
import WhatsAppMessage from '../models/whatsapp_message';
import { verifyWhatsAppSignature } from '../utils/whatsapp_crypto';

/**
 * WhatsApp Cloud API webhook — foundation (step 1 of the ordering plan).
 *
 * GET  /webhooks/whatsapp  — Meta's verify handshake. Echoes the
 *      challenge only when hub.mode=subscribe and the verify token
 *      matches WHATSAPP_VERIFY_TOKEN. Never echo for a mismatch.
 * POST /webhooks/whatsapp  — inbound messages. Every POST is checked
 *      with HMAC-SHA256 (X-Hub-Signature-256, WHATSAPP_APP_SECRET)
 *      against the RAW body before anything is parsed or stored.
 *      Then, per message: look the restaurant up by phone_number_id
 *      (runWithoutTenant, exactly like the public QR lookup), dedupe
 *      on Meta's message id, and record receipt. Unknown numbers are
 *      logged and ignored — no order is ever created for them.
 *
 * Phase 2 (not in this file yet) builds on the receipt record:
 * interactive menu flow, LLM natural-language parsing behind the
 * Confirm gate, and order creation reusing priceItems + calcTotals +
 * DailyCounter + Order.create in a transaction, as placeGuestOrder
 * does. Until a restaurant connects via Embedded Signup there is no
 * WhatsAppConnection row, so every real message today is correctly
 * ignored as "unknown number".
 */

type MetaMessage = {
  id: string;
  from: string;
  timestamp?: string;
  type?: string;
};

type MetaChangeValue = {
  messaging_product?: string;
  metadata?: { phone_number_id?: string };
  messages?: MetaMessage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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
  // The raw body is required for the signature check: parse only after verifying.
  const rawBody = await c.req.text();
  const signature = c.req.header('x-hub-signature-256');
  if (!verifyWhatsAppSignature(rawBody, signature, appSecret)) {
    return c.json({ message: 'Invalid signature' }, 401);
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return c.json({ message: 'Invalid JSON' }, 400);
  }
  if (!isRecord(body) || body.object !== 'whatsapp_business_account') {
    return c.json({ message: 'Not a WhatsApp event' }, 400);
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value as unknown as MetaChangeValue;
      const phoneNumberId = value.metadata?.phone_number_id;
      const messages = Array.isArray(value.messages) ? value.messages : [];
      if (!phoneNumberId || messages.length === 0) continue;

      const connection = await runWithoutTenant(() =>
        WhatsAppConnection.findOne({ phoneNumberId, status: { $ne: 'disconnected' } })
      );
      if (!connection || !connection.restaurantId) {
        console.log(`[WhatsApp] Ignoring message for unmapped number ${phoneNumberId}`);
        continue;
      }
      const restaurantId = String(connection.restaurantId);

      await runWithTenant(restaurantId, async () => {
        for (const message of messages) {
          if (!message?.id || !message?.from) continue;
          const seen = await WhatsAppMessage.findOne({ metaMessageId: message.id });
          if (seen) continue;
          await WhatsAppMessage.create({
            phoneNumberId,
            from: message.from,
            metaMessageId: message.id,
            messageType: message.type || 'unknown',
            receivedAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          });
          // Phase 2 hook: interactive menu / LLM-parse / confirm / order
          // creation happens from this receipt record, never from raw text.
          console.log(`[WhatsApp] Received ${message.type || 'unknown'} for restaurant ${restaurantId}`);
        }
      });
    }
  }

  // Acknowledge fast so Meta does not retry; processing above is
  // receipt-only by design in this foundation step.
  return c.json({ received: true }, 200);
}

export default { verifyWebhook, receiveWebhook };
