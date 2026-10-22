import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import { app } from '../index';

// Signing in with Google: the web goes through Google's page, the app sends the ID token it got natively.
// Google's keys are replaced by a test key, so the ID tokens below are signed here.

const WEB_CLIENT = 'web-client.apps.googleusercontent.com';
const IOS_CLIENT = 'ios-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_ID = WEB_CLIENT;
process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
process.env.GOOGLE_IOS_CLIENT_ID = IOS_CLIENT;

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const KID = 'test-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongod.getUri());
  }
  const realFetch = globalThis.fetch;
  spyOn(globalThis, 'fetch').mockImplementation((async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === GOOGLE_CERTS) return Response.json({ keys: [jwk] });
    return realFetch(input, init);
  }) as typeof fetch);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

type Json = Record<string, any>;

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** A Google ID token, as the app gets it from Google's native sign-in. */
function idToken(claims: Json = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://accounts.google.com',
    aud: WEB_CLIENT,
    sub: randomUUID(),
    email: 'someone@gmail.com',
    email_verified: true,
    name: 'Some One',
    picture: 'https://lh3.googleusercontent.com/a/photo',
    iat: now,
    exp: now + 3600,
    ...claims,
  };
  const unsigned = `${b64({ alg: 'RS256', kid: KID, typ: 'JWT' })}.${b64(body)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey).toString('base64url');
  return `${unsigned}.${signature}`;
}

const post = (path: string, body: unknown) =>
  app.request(`/api/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });

const google = (token: string) => post('/sign-in/social', { provider: 'google', idToken: { token } });

const users = () => mongoose.connection.db!.collection('user');

describe('Google sign-in', () => {
  it('tells the apps to show the Google button only when it is configured', async () => {
    expect(await (await app.request('/api/v1/public/sign-in-providers')).json()).toEqual({ web: ['google'], app: ['google'] });

    // Without the secret the web cannot finish Google's redirect; the app only needs the client ID.
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(await (await app.request('/api/v1/public/sign-in-providers')).json()).toEqual({ web: [], app: ['google'] });
    delete process.env.GOOGLE_CLIENT_ID;
    expect(await (await app.request('/api/v1/public/sign-in-providers')).json()).toEqual({ web: [], app: [] });
    process.env.GOOGLE_CLIENT_ID = WEB_CLIENT;
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
  });

  it('signs a new person up with an app ID token, email confirmed, and answers with me', async () => {
    const sub = randomUUID();
    const res = await google(idToken({ sub, email: 'new-google@gmail.com', name: 'New Google' }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') || '';
    expect(cookie).toContain('session_token');
    const body = (await res.json()) as Json;
    expect(body.redirect).toBe(false);
    expect(body.me.user).toMatchObject({ email: 'new-google@gmail.com', name: 'New Google' });

    const user = await users().findOne({ email: 'new-google@gmail.com' });
    expect(user?.emailVerified).toBe(true);

    const me = await app.request('/api/v1/me', { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);
    expect(((await me.json()) as Json).user.email).toBe('new-google@gmail.com');

    // The same Google account signs in to the same person next time.
    const again = (await (await google(idToken({ sub, email: 'new-google@gmail.com' }))).json()) as Json;
    expect(again.me.user.id).toBe(body.me.user.id);
    expect(await users().countDocuments({ email: 'new-google@gmail.com' })).toBe(1);
  });

  it('accepts tokens from the iPhone app, issued to the iOS client', async () => {
    expect((await google(idToken({ aud: IOS_CLIENT, email: 'iphone@gmail.com' }))).status).toBe(200);
  });

  it('joins a password account whose email is confirmed, and keeps its password working', async () => {
    const email = 'linked@test.com';
    const signedUp = (await (await post('/sign-up/email', { email, name: 'Linked', password: 'StrongPassword123!' })).json()) as Json;
    await users().updateOne({ email }, { $set: { emailVerified: true } });

    const res = await google(idToken({ email }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as Json).me.user.id).toBe(signedUp.user.id);
    expect(await users().countDocuments({ email })).toBe(1);
    expect((await post('/sign-in/email', { email, password: 'StrongPassword123!' })).status).toBe(200);
  });

  it('refuses to join an account whose email was never confirmed', async () => {
    const email = 'unconfirmed@test.com';
    await post('/sign-up/email', { email, name: 'Unconfirmed', password: 'StrongPassword123!' });

    const res = await google(idToken({ email }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as Json).code).toBe('OAUTH_LINK_ERROR');
    const user = await users().findOne({ email });
    expect(await mongoose.connection.db!.collection('account').countDocuments({ userId: user!._id, providerId: 'google' })).toBe(0);
  });

  it('refuses tokens for another app, expired, unsigned by Google, or without a confirmed email', async () => {
    const now = Math.floor(Date.now() / 1000);
    expect((await google(idToken({ aud: 'someone-elses-app.apps.googleusercontent.com' }))).status).toBe(401);
    expect((await google(idToken({ iat: now - 7200, exp: now - 3600 }))).status).toBe(401);
    expect((await google(idToken({ iss: 'https://evil.example' }))).status).toBe(401);
    const [head, body] = idToken().split('.');
    expect((await google(`${head}.${body}.${Buffer.from('forged').toString('base64url')}`)).status).toBe(401);

    // Google says the email is not confirmed: no account is made that others could be invited to.
    expect((await google(idToken({ email: 'unverified-google@gmail.com', email_verified: false }))).status).toBe(401);
    expect(await users().countDocuments({ email: 'unverified-google@gmail.com' })).toBe(0);
  });

  it("sends the web to Google's page, coming back to /callback/google", async () => {
    const res = await post('/sign-in/social', { provider: 'google', callbackURL: 'http://localhost:3000/', errorCallbackURL: 'http://localhost:3000/login' });
    expect(res.status).toBe(200);
    const url = new URL(((await res.json()) as Json).url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe(WEB_CLIENT);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/callback/google');
    expect(url.searchParams.get('prompt')).toBe('select_account');
  });

  it('keeps email and password sign-in working', async () => {
    const email = 'plain@test.com';
    await post('/sign-up/email', { email, name: 'Plain', password: 'StrongPassword123!' });
    const res = await post('/sign-in/email', { email, password: 'StrongPassword123!' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Json).me.user.email).toBe(email);
  });
});
