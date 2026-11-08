import { decryptWhatsAppToken } from '../utils/whatsapp_crypto';
import { graphPhone } from '../utils/whatsapp_phone';
import type { IWhatsAppConnection } from '../models/whatsapp_connection';

const GRAPH = 'https://graph.facebook.com/v26.0';
export class WhatsAppSendError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function sendWhatsApp(connection: IWhatsAppConnection, phone: string, payload: Record<string, unknown>): Promise<string> {
  if (!connection.accessTokenEncrypted || connection.status !== 'connected') {
    throw new WhatsAppSendError('The restaurant WhatsApp number is not connected for sending', 409);
  }
  const to = graphPhone(phone);
  if (!to) throw new WhatsAppSendError('Invalid recipient number', 400);
  const token = decryptWhatsAppToken(connection.accessTokenEncrypted);
  const response = await fetch(`${GRAPH}/${encodeURIComponent(connection.phoneNumberId)}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, ...payload }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({})) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!response.ok || !body.messages?.[0]?.id) {
    throw new WhatsAppSendError(`WhatsApp delivery request failed (${response.status}): ${body.error?.message || 'No message ID returned'}`, 502);
  }
  return body.messages[0].id;
}
export async function uploadWhatsAppPdf(connection: IWhatsAppConnection, data: Uint8Array, filename: string): Promise<string> {
  if (!connection.accessTokenEncrypted || connection.status !== 'connected') throw new WhatsAppSendError('WhatsApp number is not connected', 409);
  const token = decryptWhatsAppToken(connection.accessTokenEncrypted);
  const form = new FormData();
  form.set('messaging_product', 'whatsapp');
  form.set('type', 'application/pdf');
  form.set('file', new Blob([new Uint8Array(data)], { type: 'application/pdf' }), filename);
  const response = await fetch(`${GRAPH}/${encodeURIComponent(connection.phoneNumberId)}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({})) as { id?: string };
  if (!response.ok || !payload.id) throw new WhatsAppSendError(`WhatsApp media upload failed (${response.status})`, 502);
  return payload.id;
}
