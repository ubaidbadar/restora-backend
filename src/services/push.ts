import webpush from 'web-push';
import type Permission from '@shared/permission';
import PushDevice from '../models/push_device';
import StaffMember from '../models/staff_member';
import Role from '../models/role';

/** What a tap opens: the orders board, or the tables (a guest's call). */
type Alert = { title: string; body: string; screen: 'orders' | 'tables'; tag: string };

const EXPO_SEND = 'https://exp.host/--/api/v2/push/send';
/** A guest's order or call is stale after 10 minutes; a phone offline longer does not get it late. */
const TTL_SECONDS = 600;

/** Web push keys, made once with `bunx web-push generate-vapid-keys`. Without them, browsers get no alerts. */
export const webPushKey = () => process.env.WEB_PUSH_PUBLIC_KEY || null;

/**
 * The phones and browsers of everyone at the restaurant who may see this alert: an active member of that branch (or of
 * every branch) with `permission`, whose device has that branch, or every branch, open. One read.
 */
function devicesFor(restaurantId: string, branchId: string, permission: Permission) {
  return PushDevice.aggregate<{ kind: 'expo' | 'web'; token: string; keys?: { p256dh: string; auth: string } }>([
    { $match: { restaurantId, branchId: { $in: [branchId, null] } } },
    {
      $lookup: {
        from: StaffMember.collection.collectionName,
        let: { userId: '$userId' },
        pipeline: [{ $match: { restaurantId, status: 'active', $expr: { $eq: ['$userId', '$$userId'] } } }],
        as: 'member',
      },
    },
    { $unwind: '$member' },
    {
      $lookup: {
        from: Role.collection.collectionName,
        let: { roleIds: '$member.roleIds' },
        pipeline: [{ $match: { restaurantId, $expr: { $in: [{ $toString: '$_id' }, '$$roleIds'] } } }, { $project: { key: 1, permissions: 1 } }],
        as: 'roles',
      },
    },
    { $addFields: { owner: { $or: ['$member.isOwner', '$member.isPrimaryOwner', { $in: ['owner', '$roles.key'] }] } } },
    {
      $match: {
        $and: [
          { $or: [{ owner: true }, { 'member.branchScope': 'all' }, { 'member.branchIds': branchId }] },
          { $or: [{ owner: true }, { 'roles.permissions': permission }] },
        ],
      },
    },
    { $project: { _id: 0, kind: 1, token: 1, keys: 1 } },
  ]);
}

/** Sends to Expo, 100 phones a request. Answers the tokens Expo says are gone (app removed, notifications off). */
async function sendExpo(tokens: string[], alert: Alert) {
  const gone: string[] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const res = await fetch(EXPO_SEND, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        chunk.map((to) => ({ to, title: alert.title, body: alert.body, data: { screen: alert.screen }, sound: 'default', priority: 'high', channelId: 'guests', ttl: TTL_SECONDS }))
      ),
    });
    if (!res.ok) {
      console.error('[Push] Expo answered', res.status, await res.text().catch(() => ''));
      continue;
    }
    const { data } = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
    data?.forEach((ticket, index) => {
      if (ticket.details?.error === 'DeviceNotRegistered') gone.push(chunk[index]!);
    });
  }
  return gone;
}

/** Sends to each browser. Answers the endpoints the browser's push service says are gone (unsubscribed, expired). */
async function sendWeb(devices: { token: string; keys?: { p256dh: string; auth: string } }[], alert: Alert) {
  const publicKey = webPushKey();
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return [];
  const vapidDetails = { subject: process.env.WEB_PUSH_SUBJECT || 'https://restora.live', publicKey, privateKey };
  const payload = JSON.stringify(alert);

  const results = await Promise.all(
    devices.map((device) =>
      webpush
        .sendNotification({ endpoint: device.token, keys: device.keys! }, payload, { TTL: TTL_SECONDS, urgency: 'high', topic: alert.tag.slice(0, 32), vapidDetails })
        .then(() => null)
        .catch((err: { statusCode?: number; body?: string }) => {
          if (err.statusCode === 404 || err.statusCode === 410) return device.token;
          console.error('[Push] web push failed:', err.statusCode, err.body);
          return null;
        })
    )
  );
  return results.filter((token) => token !== null);
}

/**
 * Alerts the staff who should know, on their phones (Expo) and browsers (web push). Devices that are gone are forgotten.
 * The apps show nothing while they are open, since the live stream already shows a toast there.
 */
export default async function notifyStaff(restaurantId: string, branchId: string, permission: Permission, alert: Alert) {
  const devices = await devicesFor(restaurantId, branchId, permission);
  if (!devices.length) return;
  const [expoGone, webGone] = await Promise.all([
    sendExpo(devices.filter((device) => device.kind === 'expo').map((device) => device.token), alert),
    sendWeb(devices.filter((device) => device.kind === 'web' && device.keys), alert),
  ]);
  const gone = [...expoGone, ...webGone];
  if (gone.length) await PushDevice.deleteMany({ token: { $in: gone } });
}
