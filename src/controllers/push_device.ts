import type { Context } from 'hono';
import PushDevice from '../models/push_device';
import { webPushKey } from '../services/push';

/** The key browsers subscribe with; null while web push is not set up on the server. */
export async function getWebPushKey(c: Context) {
  return c.json({ publicKey: webPushKey() });
}

/** Saves this phone or browser for the person signed in and the workplace open now. Saving it again moves it along. */
export async function savePushDevice(c: Context) {
  const body = c.get('validatedJson');
  const branchId = c.get('branchId') as string | undefined;
  const token = body.kind === 'expo' ? body.token : body.endpoint;
  // Replaced whole, so a branch or keys it had before do not stay behind.
  await PushDevice.replaceOne(
    { token },
    { userId: c.get('user').id, restaurantId: c.get('restaurantId'), branchId, kind: body.kind, token, keys: body.keys },
    { upsert: true }
  );
  return c.json({ success: true });
}

/** Forgets this phone or browser for the person signed in: before signing out, or when they turn alerts off. */
export async function removePushDevice(c: Context) {
  const { token } = c.get('validatedJson');
  await PushDevice.deleteOne({ token, userId: c.get('user').id });
  return c.json({ success: true });
}

export default {
  webKey: getWebPushKey,
  save: savePushDevice,
  remove: removePushDevice,
};
