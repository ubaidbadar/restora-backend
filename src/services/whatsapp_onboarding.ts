import { encryptWhatsAppToken, decryptWhatsAppToken } from '../utils/whatsapp_crypto';
import WhatsAppConnection from '../models/whatsapp_connection';
import { runWithoutTenant } from '../middlewares/tenant_context';
import type { IWhatsAppConnection } from '../models/whatsapp_connection';

const GRAPH = 'https://graph.facebook.com/v26.0';
const META_ID = /^[0-9]{5,30}$/;
export class OnboardingError extends Error {
  constructor(public statusCode: 400 | 409 | 502 | 503, message: string) { super(message); }
}
function credentials() {
  const id = process.env.WHATSAPP_META_APP_ID, secret = process.env.WHATSAPP_META_APP_SECRET;
  if (!id || !secret) throw new OnboardingError(503, 'Meta Embedded Signup is not configured. Contact Restora support.');
  return { id, secret };
}
async function graph<T>(endpoint: string, token: string, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const response = await fetch(GRAPH + endpoint, {
    method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  const data = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    console.error('[WhatsApp Signup] Meta request failed', { endpoint: endpoint.split('?')[0], status: response.status });
    throw new OnboardingError(502, 'Meta could not complete this operation. Check your Meta Business permissions and retry.');
  }
  return data;
}

/** Exchange the *one-time* code on the server; never send a Meta token back to the client. */
export async function exchangeEmbeddedCode(code: string) {
  const { id, secret } = credentials();
  const query = new URLSearchParams({ client_id: id, client_secret: secret, code });
  const res = await fetch(`${GRAPH}/oauth/access_token?${query}`, { signal: AbortSignal.timeout(12_000) });
  const data = await res.json().catch(() => ({})) as { access_token?: string };
  if (!res.ok || !data.access_token) throw new OnboardingError(400, 'Meta authorization expired or was rejected. Please connect again.');
  return data.access_token;
}

export async function finishWhatsAppSignup(params: {
  restaurantId: string; branchId: string; wabaId: string; phoneNumberId?: string; code: string;
}) {
  const { restaurantId, branchId, wabaId, phoneNumberId, code } = params;
  if (!META_ID.test(wabaId) || (phoneNumberId && !META_ID.test(phoneNumberId)))
    throw new OnboardingError(400, 'Invalid Meta account or number ID');
  const token = await exchangeEmbeddedCode(code);
  // Validates server-side that the token actually has access to the claimed WABA and number.
  const phoneList = await graph<{ data?: { id: string; display_phone_number?: string; status?: string }[] }>(
    `/${wabaId}/phone_numbers?fields=id,display_phone_number,status&limit=100`, token);
  // Meta's coexistence finish event can omit phone_number_id. Resolve it
  // only when this WABA offers exactly one number, never guess among many.
  const candidates = phoneList.data || [];
  const phone = phoneNumberId ? candidates.find(entry => entry.id === phoneNumberId)
    : candidates.length === 1 ? candidates[0] : undefined;
  if (!phone) throw new OnboardingError(409,
    'Meta did not identify one WhatsApp number. If multiple numbers belong to this account, select the number in Meta and retry.');
  const verifiedPhoneId = phone.id;
  // Global routing identity is unique across all tenants and branches.
  const previous = await runWithoutTenant(() => WhatsAppConnection.findOne({ phoneNumberId: verifiedPhoneId }));
  if (previous && (String(previous.restaurantId) !== restaurantId || previous.branchId !== branchId)) {
    throw new OnboardingError(409, 'This WhatsApp number is already connected to another restaurant or branch.');
  }
  // A subscribed WABA routes Meta webhooks to our verified public endpoint.
  const subscription = await graph<{ success?: boolean }>(`/${wabaId}/subscribed_apps`, token, 'POST');
  if (!subscription.success) throw new OnboardingError(502, 'Meta did not confirm webhook subscription. Please retry.');
  // Never mark the number connected if Meta still needs registration.
  const status: IWhatsAppConnection['status'] = phone.status === 'CONNECTED' ? 'connected' : 'number_pending';
  try {
    const connected = await WhatsAppConnection.findOneAndUpdate({ phoneNumberId: verifiedPhoneId, branchId },
      { $set: { wabaId, phoneNumberDisplay: phone.display_phone_number || phoneNumberId,
        accessTokenEncrypted: encryptWhatsAppToken(token), status,
        ...(status === 'connected' ? { connectedAt: new Date() } : {}) },
      }, { upsert: true, returnDocument: 'after', runValidators: true });
    if (!connected) throw new OnboardingError(502, 'Unable to save the WhatsApp connection');
    return { id: String(connected._id), status: connected.status, phoneNumberDisplay: connected.phoneNumberDisplay,
      phoneNumberId: verifiedPhoneId, nextStep: status === 'number_pending' ? 'register' : 'ready' };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) throw new OnboardingError(409, 'WhatsApp number is already linked. Reload the connection list.');
    throw error;
  }
}

export async function registerWithPin(connection: IWhatsAppConnection, pin: string) {
  if (!connection.accessTokenEncrypted) throw new OnboardingError(409, 'Reconnect the number before registration.');
  const token = decryptWhatsAppToken(connection.accessTokenEncrypted);
  const res = await fetch(`${GRAPH}/${connection.phoneNumberId}/register`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }), signal: AbortSignal.timeout(12_000),
  });
  const result = await res.json().catch(() => ({})) as { success?: boolean | string };
  if (!res.ok || !(result.success === true || result.success === 'true')) {
    console.error('[WhatsApp Signup] Registration rejected', { status: res.status, phoneNumberId: connection.phoneNumberId });
    throw new OnboardingError(502, 'Meta could not register the number. Verify the PIN and number eligibility.');
  }
  await WhatsAppConnection.updateOne({ phoneNumberId: connection.phoneNumberId, branchId: connection.branchId },
    { $set: { status: 'connected', connectedAt: new Date() } });
  return { connected: true };
}
