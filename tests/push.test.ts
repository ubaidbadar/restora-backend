import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import webpush from 'web-push';
import { app } from '../index';
import PushDevice from '../src/models/push_device';

type Json = any;

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let otherHeaders: Record<string, string>;
let branchId: string;
let karahi: Json;
let code: string;

/** What was sent to Expo and to browsers, and which Expo tokens Expo calls gone. */
const expoSent: Json[] = [];
const webSent: { endpoint: string; payload: Json }[] = [];
const goneTokens = new Set<string>();
const realFetch = globalThis.fetch;

async function signUp(email: string, restaurant: string) {
  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Push Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: restaurant, branchName: 'Gulberg', city: 'Lahore' }),
  });
  const { restaurantId } = (await onboard.json()) as Json;
  return { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const keys = webpush.generateVAPIDKeys();
  process.env.WEB_PUSH_PUBLIC_KEY = keys.publicKey;
  process.env.WEB_PUSH_PRIVATE_KEY = keys.privateKey;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('https://exp.host/')) {
      const messages = JSON.parse(String(init?.body)) as Json[];
      expoSent.push(...messages);
      const data = messages.map((message) => (goneTokens.has(message.to) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 'x' }));
      return Response.json({ data });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  webpush.sendNotification = (async (subscription: webpush.PushSubscription, payload?: string | Buffer | null) => {
    if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('Gone'), { statusCode: 410 });
    webSent.push({ endpoint: subscription.endpoint, payload: JSON.parse(String(payload)) });
    return { statusCode: 201, body: '', headers: {} };
  }) as typeof webpush.sendNotification;

  headers = await signUp('push@restaurant.com', 'Push House');
  otherHeaders = await signUp('other@restaurant.com', 'Other House');
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;
  const food = (await post('/api/v1/menu/categories', { name: 'Mains' })).body;
  karahi = (await post('/api/v1/menu/items', { categoryId: food._id, name: 'Chicken Karahi', sizes: [{ price: 1400 }] })).body;
  await post('/api/v1/tables', { branchId, name: 'T1', section: 'Hall', seats: 4 });
  const tables = (await (await app.request('/api/v1/tables', { headers })).json()) as Json[];
  code = tables[0].qrCode;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await mongoose.disconnect();
  await mongod.stop();
});

async function post(path: string, body: unknown, extra: Record<string, string> = headers) {
  const res = await app.request(path, { method: 'POST', headers: extra, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Json };
}

const guest = (path: string, body: unknown) =>
  app.request(`/api/v1/public/t/${code}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** The alerts go out after the guest's answer; wait for them. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 25));
}

const phone = 'ExponentPushToken[phone-1]';
const goneToken = 'ExponentPushToken[old-phone]';
const browser = { kind: 'web', endpoint: 'https://fcm.googleapis.com/fcm/send/browser-1', keys: { p256dh: 'BKey', auth: 'secret' } };

describe('Push devices', () => {
  it('gives browsers the key to subscribe with', async () => {
    const res = await app.request('/api/v1/push-devices/web-key', { headers });
    expect(((await res.json()) as Json).publicKey).toBe(process.env.WEB_PUSH_PUBLIC_KEY!);
  });

  it('saves a phone and a browser, and refuses a wrong token', async () => {
    expect((await post('/api/v1/push-devices', { kind: 'expo', token: phone })).status).toBe(200);
    expect((await post('/api/v1/push-devices', { kind: 'expo', token: phone })).status).toBe(200);
    expect((await post('/api/v1/push-devices', { kind: 'expo', token: goneToken })).status).toBe(200);
    expect((await post('/api/v1/push-devices', browser)).status).toBe(200);
    expect((await post('/api/v1/push-devices', { ...browser, endpoint: 'https://push.example.com/gone' })).status).toBe(200);
    expect((await post('/api/v1/push-devices', { kind: 'expo', token: 'not-a-token' })).status).toBe(400);
    expect((await post('/api/v1/push-devices', { ...browser, endpoint: 'http://insecure.example.com/x' })).status).toBe(400);
    // Another restaurant's phone.
    expect((await post('/api/v1/push-devices', { kind: 'expo', token: 'ExponentPushToken[other]' }, otherHeaders)).status).toBe(200);
    expect(await PushDevice.countDocuments({})).toBe(5);
  });

  it("alerts the restaurant's phones and browsers when a guest orders, once, and forgets gone devices", async () => {
    goneTokens.add(goneToken);
    const res = await guest('order', { items: [{ itemId: karahi._id, qty: 2 }], clientId: 'guest-1' });
    expect(res.status).toBe(201);
    await settle();

    expect(expoSent.map((message) => message.to).sort()).toEqual([phone, goneToken].sort());
    expect(expoSent[0]).toMatchObject({ title: 'Table T1 sent order #1', body: '2× Chicken Karahi', data: { screen: 'orders' }, sound: 'default', channelId: 'guests' });
    expect(webSent).toEqual([{ endpoint: browser.endpoint, payload: { title: 'Table T1 sent order #1', body: '2× Chicken Karahi', screen: 'orders', tag: expect.stringMatching(/^order-/) } }]);
    expect(await PushDevice.exists({ token: goneToken })).toBeNull();
    expect(await PushDevice.exists({ token: 'https://push.example.com/gone' })).toBeNull();

    // The same order sent again (a retry) does not alert again.
    expoSent.length = 0;
    expect((await guest('order', { items: [{ itemId: karahi._id, qty: 2 }], clientId: 'guest-1' })).status).toBe(201);
    await settle();
    expect(expoSent).toEqual([]);
  });

  it('alerts for a waiter call once while it is open', async () => {
    expoSent.length = 0;
    webSent.length = 0;
    await guest('call', { kind: 'bill' });
    await guest('call', { kind: 'bill' });
    await settle();
    expect(expoSent).toHaveLength(1);
    expect(expoSent[0]).toMatchObject({ to: phone, title: 'Table T1 asks for the bill', data: { screen: 'tables' } });
    expect(webSent).toHaveLength(1);
  });

  it('forgets a device on sign-out, only for its own person', async () => {
    expect((await post('/api/v1/push-devices/remove', { token: phone }, otherHeaders)).status).toBe(200);
    expect(await PushDevice.exists({ token: phone })).not.toBeNull();
    expect((await post('/api/v1/push-devices/remove', { token: phone })).status).toBe(200);
    expect(await PushDevice.exists({ token: phone })).toBeNull();
  });
});
