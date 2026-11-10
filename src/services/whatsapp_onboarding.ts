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
  // FB.login() manages its own OAuth redirect. If Meta requires redirect_uri
  // during the code exchange, it must match the EXACT URI from the login
  // dialog, not an invented Restora callback endpoint.
  const redirectUri = process.env.WHATSAPP_META_REDIRECT_URI?.trim();
  if (redirectUri) {
    let parsed: URL;
    try { parsed = new URL(redirectUri); }
    catch { throw new OnboardingError(503, 'WHATSAPP_META_REDIRECT_URI must be an absolute HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
      throw new OnboardingError(503, 'WHATSAPP_META_REDIRECT_URI must be an HTTPS URL without credentials or a fragment.');
    query.set('redirect_uri', redirectUri);
  }
  const res = await fetch(`${GRAPH}/oauth/access_token?${query}`, { signal: AbortSignal.timeout(12_000) });
  const data = await res.json().catch(() => ({})) as {
    access_token?: string;
    error?: {
      code?: number;
      error_subcode?: number;
      is_transient?: boolean;
      message?: string;
      fbtrace_id?: string;
    };
  };
  if (!res.ok || !data.access_token) {
    const error = data.error;
    const code = Number.isSafeInteger(error?.code) ? error!.code : undefined;
    const subcode = Number.isSafeInteger(error?.error_subcode) ? error!.error_subcode : undefined;
    // Classify Meta's description, but never log or return its raw text:
    // OAuth messages can contain user-supplied or sensitive request values.
    const message = error?.message || '';
    const reason = /redirect[_ ]uri/i.test(message) ? 'redirect_uri'
      : /client[_ ]secret|app secret|client[_ ]id|app id/i.test(message) ? 'app_credentials'
      : /already (?:been )?used|used already/i.test(message) ? 'code_reused'
      : /expir/i.test(message) ? 'code_expired' : 'unclassified';
    console.error('[WhatsApp Signup] Meta OAuth code exchange failed', {
      httpStatus: res.status, metaCode: code, metaSubcode: subcode,
      reason, transient: error?.is_transient === true,
      traceId: typeof error?.fbtrace_id === 'string' && /^[A-Za-z0-9_-]{5,100}$/.test(error.fbtrace_id)
        ? error.fbtrace_id : undefined,
    });
    if (res.status >= 500 || error?.is_transient === true)
      throw new OnboardingError(502, 'Meta could not process signup right now. Please retry.');
    if (reason === 'redirect_uri')
      throw new OnboardingError(400, 'Meta OAuth redirect URI mismatch. Check Facebook Login for Business redirect and JavaScript SDK domain settings.');
    if (reason === 'app_credentials')
      throw new OnboardingError(400, 'Meta rejected the app credentials. Check WHATSAPP_META_APP_ID and WHATSAPP_META_APP_SECRET belong to the same Meta app.');
    if (reason === 'code_reused')
      throw new OnboardingError(400, 'Meta authorization code was already used. Start a fresh WhatsApp signup.');
    if (reason === 'code_expired')
      throw new OnboardingError(400, 'Meta authorization code expired. Start a fresh WhatsApp signup.');
    throw new OnboardingError(400, `Meta rejected the authorization code (error ${code ?? 'unknown'}${subcode === undefined ? '' : `, subcode ${subcode}`}). Check Meta app credentials and Facebook Login for Business settings.`);
  }
  return data.access_token;
}

/** Resolve an unambiguous WABA through Meta's authenticated token inspection. */
async function singleAuthorizedWaba(token: string): Promise<string> {
  const { id, secret } = credentials();
  const response = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}`, {
    headers: { Authorization: `Bearer ${id}|${secret}` },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    console.error('[WhatsApp Signup] Meta token inspection failed', { status: response.status });
    throw new OnboardingError(502, 'Unable to verify Meta authorization. Try connecting again.');
  }
  const result = await response.json().catch(() => ({})) as {
    data?: { app_id?: string; is_valid?: boolean; granular_scopes?: { scope: string; target_ids?: string[] }[] };
  };
  if (result.data?.is_valid !== true || String(result.data.app_id) !== id)
    throw new OnboardingError(400, 'Meta authorization is invalid for this app. Please connect again.');
  const ids = [...new Set((result.data.granular_scopes || [])
    .filter((scope) => scope.scope === 'whatsapp_business_management')
    .flatMap((scope) => scope.target_ids || [])
    .filter((value) => META_ID.test(value)))];
  if (ids.length !== 1)
    throw new OnboardingError(409, 'Meta did not identify exactly one WhatsApp Business Account. Select one account and retry.');
  return ids[0]!;
}

export async function finishWhatsAppSignup(params: {
  restaurantId: string; branchId: string; wabaId?: string; phoneNumberId?: string; code: string;
}) {
  const { restaurantId, branchId, phoneNumberId, code } = params;
  if ((params.wabaId && !META_ID.test(params.wabaId)) || (phoneNumberId && !META_ID.test(phoneNumberId)))
    throw new OnboardingError(400, 'Invalid Meta account or number ID');
  const token = await exchangeEmbeddedCode(code);
  const wabaId = params.wabaId || await singleAuthorizedWaba(token);
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
