import { beforeAll, afterAll, describe, expect, it } from 'bun:test';
import { createHmac } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import { runWithTenant } from '../src/middlewares/tenant_context';
import WhatsAppConnection from '../src/models/whatsapp_connection';
import WhatsAppMessage from '../src/models/whatsapp_message';

const keys = ['WHATSAPP_META_APP_ID','WHATSAPP_META_APP_SECRET','WHATSAPP_META_CONFIG_ID',
  'WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN','WHATSAPP_TOKEN_ENCRYPTION_KEY'] as const;
const existing = Object.fromEntries(keys.map(k => [k, process.env[k]]));
const oldFetch = globalThis.fetch;
let mongo: MongoMemoryServer;
let a: { cookie: string; restaurantId: string; branchId: string };
let b: typeof a;
const WABA = '1234567890123';
const PHONE = '923000123456';
const PHONE_ID = '555666777888';
let calls: string[] = [];
let authorizedWabas = [WABA];

async function signup(email: string, name: string) {
  const res = await app.request('/api/v1/auth/sign-up/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'StrongPassword123!' }),
  });
  expect(res.status).toBe(200);
  const cookie = res.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: name + ' Restaurant', branchName: 'Main' }),
  });
  expect(onboard.status).toBe(201);
  const body = await onboard.json() as { restaurantId: string; branch: { _id: string } };
  return { cookie, restaurantId: body.restaurantId, branchId: body.branch._id };
}
const call = (actor: typeof a, method: string, path: string, body?: unknown) =>
  app.request('/api/v1/whatsapp' + path, { method,
    headers: { 'Content-Type': 'application/json', Cookie: actor.cookie },
    body: body === undefined ? undefined : JSON.stringify(body) });

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo.getUri());
  process.env.WHATSAPP_META_APP_ID = '111222333444';
  process.env.WHATSAPP_META_APP_SECRET = 'not-a-real-secret';
  process.env.WHATSAPP_META_CONFIG_ID = '111122223333';
  process.env.WHATSAPP_APP_SECRET = 'test-whatsapp-signature';
  process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  a = await signup('meta-a@example.test', 'Meta A');
  b = await signup('meta-b@example.test', 'Meta B');
  globalThis.fetch = (async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/oauth/access_token')) return Response.json({ access_token: 'mock-bisu-token' });
    if (url.includes('/debug_token')) return Response.json({ data: {
      app_id: '111222333444', is_valid: true,
      granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: authorizedWabas }],
    } });
    if (url.includes('/phone_numbers')) return Response.json({ data: [{
      id: PHONE_ID, display_phone_number: PHONE, status: 'PENDING',
    }] });
    if (url.endsWith('/subscribed_apps')) return Response.json({ success: true });
    if (url.endsWith('/register') && options?.method === 'POST') return Response.json({ success: true });
    throw new Error('Unexpected Meta request ' + url);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = oldFetch;
  for (const key of keys) { if (existing[key] === undefined) delete process.env[key]; else process.env[key] = existing[key]; }
  await mongoose.disconnect();
  await mongo.stop();
});

describe('WhatsApp self-service Embedded Signup', () => {
  let id: string;
  it('does not expose server-side Meta credentials in configuration', async () => {
    const result = await call(a, 'GET', '/signup/config');
    expect(result.status).toBe(200);
    const data = await result.json() as Record<string, unknown>;
    expect(data.enabled).toBe(true);
    expect(data.appId).toBe('111222333444');
    expect(JSON.stringify(data)).not.toContain('not-a-real-secret');
    expect(JSON.stringify(data)).not.toContain('a'.repeat(64));
  });
  it('allows coexistence when Meta omits phone id but grants exactly one number', async () => {
    const response = await call(a, 'POST', '/signup/complete', { code: 'test-auth-code-12345', wabaId: WABA });
    expect(response.status).toBe(201);
    const result = await response.json() as { id: string; phoneNumberId: string; status: string };
    expect(result.phoneNumberId).toBe(PHONE_ID);
    expect(result.status).toBe('number_pending');
    id = result.id;
    const list = await call(a, 'GET', '/connections');
    const rows = await list.json() as Record<string, unknown>[];
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('accessTokenEncrypted');
    expect(JSON.stringify(rows)).not.toContain('mock-bisu-token');
    expect(calls.some(url => url.endsWith('/subscribed_apps'))).toBe(true);
  });
  it('recovers one token-authorized WABA from a code-only Meta v4 callback', async () => {
    const response = await call(a, 'POST', '/signup/complete', { code: 'code-only-auth-123456' });
    expect(response.status).toBe(201);
    const body = await response.json() as { phoneNumberId: string };
    expect(body.phoneNumberId).toBe(PHONE_ID);
    expect(calls.some(url => url.includes('/debug_token'))).toBe(true);
    const list = await call(a, 'GET', '/connections');
    expect(await list.json() as unknown[]).toHaveLength(1);
  });
  it('never guesses among multiple WABAs or WABAs without scoped access', async () => {
    for (const ids of [[WABA, '999888777666'], []]) {
      authorizedWabas = ids;
      try {
        const response = await call(a, 'POST', '/signup/complete', { code: 'code-only-ambiguous-12345' });
        expect(response.status).toBe(409);
      } finally {
        authorizedWabas = [WABA];
      }
    }
  });
  it('cannot claim another restaurant or branch number', async () => {
    const response = await call(b, 'POST', '/signup/complete', { code: 'another-auth-code-12345', wabaId: WABA, phoneNumberId: PHONE_ID });
    expect(response.status).toBe(409);
    const list = await call(b, 'GET', '/connections');
    expect(await list.json()).toEqual([]);
  });
  it('registers a pending number with a six-digit PIN and never stores the PIN', async () => {
    expect((await call(a, 'POST', `/connections/${id}/register`, { pin: '123' })).status).toBe(400);
    const result = await call(a, 'POST', `/connections/${id}/register`, { pin: '123456' });
    expect(result.status).toBe(200);
    const connection = await runWithTenant(a.restaurantId, () => WhatsAppConnection.findById(id));
    expect(connection?.status).toBe('connected');
    expect(JSON.stringify(connection?.toObject())).not.toContain('123456');
  });
  it('disconnecting revokes sending and stops new inbound order processing', async () => {
    const result = await call(a, 'POST', `/connections/${id}/disconnect`);
    expect(result.status).toBe(200);
    const connection = await runWithTenant(a.restaurantId, () => WhatsAppConnection.findById(id));
    expect(connection?.status).toBe('disconnected');
    expect(connection?.accessTokenEncrypted).toBeUndefined();
    const event = { object: 'whatsapp_business_account', entry: [{
      changes: [{ value: { metadata: { phone_number_id: PHONE_ID },
        messages: [{ id: 'wa-disconnect-test', from: '923001234567', type: 'text',
          text: { body: 'menu' }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }],
    }] };
    const raw = JSON.stringify(event);
    const signature = createHmac('sha256', 'test-whatsapp-signature').update(raw).digest('hex');
    const response = await app.request('/api/v1/webhooks/whatsapp', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': 'sha256=' + signature },
      body: raw,
    });
    expect(response.status).toBe(200);
    expect(await runWithTenant(a.restaurantId, () => WhatsAppMessage.countDocuments())).toBe(0);
  });
});
