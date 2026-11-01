import type { Context } from 'hono';
import { setCookie } from 'hono/cookie';
import Device from '../models/device';
import logAudit from '../utils/audit';
import randomToken from '../utils/random_token';
import hashToken from '../utils/hash_token';
import resolveBranchId from '../utils/resolve_branch';

const deviceJson = (d: InstanceType<typeof Device>, currentId?: string) => ({
  _id: String(d._id),
  name: d.name,
  branchId: d.branchId,
  settings: d.settings,
  lastSeenAt: d.lastSeenAt,
  createdAt: d.createdAt,
  current: currentId ? String(d._id) === currentId : false,
});

export async function listDevices(c: Context) {
  const currentDeviceId = c.get('device')?._id ? String(c.get('device')._id) : undefined;
  const devices = await Device.find({}).sort({ createdAt: -1 });
  return c.json(devices.map((d) => deviceJson(d, currentDeviceId)));
}

export async function registerDevice(c: Context) {
  const body = c.get('validatedJson');
  const branchId = await resolveBranchId(c, body.branchId);

  // 256 bits from the CSPRNG. Stored as an Argon2 hash (tokenHash) plus a SHA-256 for indexed lookup.
  const token = randomToken(32);
  const device = await Device.create({
    name: body.name,
    branchId,
    settings: {
      idleLockSeconds: body.idleLockSeconds ?? 90,
      lockAfterOrder: body.lockAfterOrder ?? false,
    },
    tokenHash: await Bun.password.hash(token),
    tokenLookup: hashToken(token),
    consecutiveFailedPins: 0,
    actor: null,
    pausedUntil: null,
  });

  const user = c.get('user');
  await logAudit({
    action: 'device.registered',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'device', id: String(device._id), label: device.name },
  });

  setCookie(c, 'pos_device_token', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 31536000,
    sameSite: 'Lax',
  });

  // The token lives only in the httpOnly cookie set above; the page never sees it.
  return c.json({ device: { ...deviceJson(device), current: true } }, 201);
}

export async function updateDevice(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');

  const device = await Device.findById(id);
  if (!device) {
    return c.json({ message: 'Device not found' }, 404);
  }

  if (body.name) device.name = body.name;
  if (body.branchId) {
    device.branchId = await resolveBranchId(c, body.branchId);
    device.actor = null; // Moving a terminal signs out whoever is on it.
  }
  if (body.idleLockSeconds !== undefined || body.lockAfterOrder !== undefined) {
    device.settings = {
      idleLockSeconds: body.idleLockSeconds ?? device.settings.idleLockSeconds,
      lockAfterOrder: body.lockAfterOrder ?? device.settings.lockAfterOrder,
    };
  }

  await device.save();

  const user = c.get('user');
  await logAudit({
    action: 'device.updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'device', id, label: device.name },
  });

  return c.json(deviceJson(device));
}

export async function deleteDevice(c: Context) {
  const id = c.req.param('id') ?? '';
  const device = await Device.findOneAndDelete({ _id: id });
  if (!device) {
    return c.json({ message: 'Device not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'device.removed',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'device', id, label: device.name },
  });

  return c.json({ success: true, message: 'Device deleted' });
}

export default {
  list: listDevices,
  register: registerDevice,
  update: updateDevice,
  delete: deleteDevice,
};
