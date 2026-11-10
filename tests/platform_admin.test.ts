import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import { toObjectId } from '../src/utils/auth_users';

let mongod: MongoMemoryServer;
const savedEnv = {
  owner: process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS,
  origins: process.env.PLATFORM_ADMIN_ORIGINS,
};
type Actor = { cookie: string; id: string };
async function signup(email: string): Promise<Actor> {
  const res = await app.request('/api/v1/auth/sign-up/email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: email.split('@')[0], password: 'StrongPassword123!' }),
  });
  expect(res.status).toBe(200);
  const body = await res.json() as { user: { id: string } };
  return { cookie: res.headers.get('set-cookie') || '', id: body.user.id };
}
const call = (actor: Actor | null, method: string, path: string, body?: unknown) =>
  app.request('/api/v1/platform' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(actor ? { Cookie: actor.cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function verify(id: string) {
  const objectId = toObjectId(id);
  if (!objectId) throw new Error('Platform admin test fixture returned an invalid user ID');
  await mongoose.connection.db!.collection('user').updateOne({ _id: objectId },
    { $set: { emailVerified: true } });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());
  process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = 'platform-owner@example.test';
  process.env.PLATFORM_ADMIN_ORIGINS = 'https://admin.restora.live';
});
afterAll(async () => {
  if (savedEnv.owner === undefined) delete process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS;
  else process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS = savedEnv.owner;
  if (savedEnv.origins === undefined) delete process.env.PLATFORM_ADMIN_ORIGINS;
  else process.env.PLATFORM_ADMIN_ORIGINS = savedEnv.origins;
  await mongoose.disconnect();
  await mongod.stop();
});

describe('platform administration security', () => {
  let owner: Actor;
  let teammate: Actor;
  let outsider: Actor;
  beforeAll(async () => {
    owner = await signup('platform-owner@example.test');
    teammate = await signup('platform-teammate@example.test');
    outsider = await signup('not-platform@example.test');
  });
  it('denies anonymous requests and unverified bootstrap account', async () => {
    expect((await call(null, 'GET', '/me')).status).toBe(401);
    expect((await call(owner, 'GET', '/me')).status).toBe(401);
  });
  it('rejects a non-admin even after email verification', async () => {
    await verify(outsider.id);
    expect((await call(outsider, 'GET', '/me')).status).toBe(403);
    expect((await call(outsider, 'GET', '/restaurants')).status).toBe(403);
  });
  it('authenticates only the verified bootstrap owner', async () => {
    await verify(owner.id);
    const res = await call(owner, 'GET', '/me');
    expect(res.status).toBe(200);
    expect((await res.json() as { role: string }).role).toBe('owner');
  });
  it('rejects hostile cross-origin platform requests', async () => {
    const response = await app.request('/api/v1/platform/me', {
      headers: { Cookie: owner.cookie, Origin: 'https://evil.example' },
    });
    expect(response.status).toBe(403);
  });
  it('does not grant an unverified teammate platform access', async () => {
    expect((await call(owner, 'PUT', '/team', {
      email: 'platform-teammate@example.test', role: 'support', enabled: true,
    })).status).toBe(409);
  });
  it('allows owner to grant verified teammate read-only support role and records audit', async () => {
    await verify(teammate.id);
    const response = await call(owner, 'PUT', '/team', {
      email: 'platform-teammate@example.test', role: 'support', enabled: true,
    });
    expect(response.status).toBe(200);
    const access = await call(teammate, 'GET', '/me');
    expect(access.status).toBe(200);
    expect((await access.json() as { role: string }).role).toBe('support');
    expect((await call(teammate, 'PUT', '/team', { email: 'not-platform@example.test',
      role: 'analyst', enabled: true })).status).toBe(403);
    expect((await call(teammate, 'GET', '/activity')).status).toBe(403);
    const history = await call(owner, 'GET', '/activity');
    expect(history.status).toBe(200);
    const rows = await history.json() as { target: string; after: { enabled: boolean } }[];
    expect(rows.some(row => row.target === 'platform-teammate@example.test' && row.after.enabled)).toBe(true);
  });
  it('revokes access and denies any attempt to self-promote to owner', async () => {
    expect((await call(owner, 'PUT', '/team', {
      email: 'platform-teammate@example.test', role: 'owner', enabled: true,
    })).status).toBe(400);
    expect((await call(owner, 'PUT', '/team', {
      email: 'platform-teammate@example.test', role: 'support', enabled: false,
    })).status).toBe(200);
    expect((await call(teammate, 'GET', '/me')).status).toBe(403);
  });
});
