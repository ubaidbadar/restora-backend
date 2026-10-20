import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { runWithTenant, runWithoutTenant } from './tenant_context';
import findDeviceByToken, { terminalInUse } from '../utils/find_device';

/** POS routes: the terminal's own token is the credential. Everything after runs scoped to the terminal's restaurant. */
export async function posDeviceGuard(c: Context, next: Next) {
  const deviceToken = getCookie(c, 'pos_device_token') || c.req.header('x-device-token');
  if (!deviceToken) {
    return c.json({ code: 'signed_out', message: 'This browser is not a registered POS terminal' }, 401);
  }

  const device = await findDeviceByToken(deviceToken);
  if (!device) {
    return c.json({ code: 'signed_out', message: 'This browser is not a registered POS terminal' }, 401);
  }

  // A terminal of an archived branch or a closed restaurant stops working.
  if (!(await terminalInUse(device))) {
    return c.json({ code: 'signed_out', message: 'This terminal is no longer in use. Register it again.' }, 401);
  }

  // Last seen is informative only; write it at most once a minute.
  const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
  if (Date.now() - lastSeen > 60_000) {
    device.lastSeenAt = new Date().toISOString();
    await runWithoutTenant(() => device.save());
  }

  const restaurantId = String(device.restaurantId);
  c.set('device', device);
  c.set('restaurantId', restaurantId);
  c.set('branchId', device.branchId);
  c.set('via', 'pos');

  return runWithTenant(restaurantId, () => next());
}

export default posDeviceGuard;
