import type { Context } from 'hono';
import Branch from '../models/branch';
import WhatsAppConnection from '../models/whatsapp_connection';
import { finishWhatsAppSignup, registerWithPin, OnboardingError } from '../services/whatsapp_onboarding';

const handle = (c: Context, e: unknown) => {
  if (e instanceof OnboardingError) return c.json({ message: e.message }, e.statusCode);
  console.error('[WhatsApp Signup] Unexpected failure', e instanceof Error ? e.message : 'unknown');
  return c.json({ message: 'Unable to finish WhatsApp setup. Contact support.' }, 502);
};
export function whatsappSignupConfig(c: Context) {
  const configured = Boolean(process.env.WHATSAPP_META_APP_ID && process.env.WHATSAPP_META_APP_SECRET &&
    process.env.WHATSAPP_META_CONFIG_ID && process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY && process.env.WHATSAPP_APP_SECRET &&
    process.env.WHATSAPP_VERIFY_TOKEN && /^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || ''));
  return c.json({ enabled: configured,
    appId: configured ? process.env.WHATSAPP_META_APP_ID : null,
    configId: configured ? process.env.WHATSAPP_META_CONFIG_ID : null });
}
export async function connectWhatsApp(c: Context) {
  const restaurantId = c.get('restaurantId') as string | undefined;
  const branchId = c.get('branchId') as string | undefined;
  if (!restaurantId || !branchId) return c.json({ message: 'Choose a restaurant branch first.' }, 409);
  const branch = await Branch.findOne({ _id: branchId, isActive: { $ne: false } });
  if (!branch) return c.json({ message: 'The selected branch is inactive.' }, 409);
  const { code, wabaId, phoneNumberId } = c.get('validatedJson') as { code: string; wabaId: string; phoneNumberId: string };
  try {
    return c.json(await finishWhatsAppSignup({ restaurantId, branchId, code, wabaId, phoneNumberId }), 201);
  } catch (e) { return handle(c, e); }
}
export async function registerNumber(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  if (!branchId) return c.json({ message: 'Choose a branch first' }, 409);
  const { pin } = c.get('validatedJson') as { pin: string };
  const connection = await WhatsAppConnection.findOne({ _id: c.req.param('id'), branchId }).catch(() => null);
  if (!connection) return c.json({ message: 'WhatsApp connection not found' }, 404);
  if (connection.status !== 'number_pending') return c.json({ message: 'This number does not require registration. Reconnect via Meta if its token expired.' }, 409);
  try { return c.json(await registerWithPin(connection, pin)); }
  catch (e) { return handle(c, e); }
}
export async function disconnectNumber(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  if (!branchId) return c.json({ message: 'Choose a branch first' }, 409);
  const connection = await WhatsAppConnection.findOneAndUpdate(
    { _id: c.req.param('id'), branchId }, { $set: { status: 'disconnected' }, $unset: { accessTokenEncrypted: '' } },
    { returnDocument: 'after' }).catch(() => null);
  if (!connection) return c.json({ message: 'Connection not found' }, 404);
  // Deliberately do not unsubscribe the whole WABA: that may affect other numbers.
  return c.json({ id: String(connection._id), status: connection.status });
}
