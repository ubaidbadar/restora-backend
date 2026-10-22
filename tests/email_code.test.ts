import { describe, it, expect, beforeAll, afterAll, spyOn } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';

// Emailed 6-digit codes: confirming an email and resetting a password, next to the old links.

let mongod: MongoMemoryServer;
const printed: string[] = [];

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongod.getUri());
  }
  // In tests emails are printed, not sent: read the codes from there.
  spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    printed.push(args.join(' '));
  });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

type Json = Record<string, any>;

const post = (path: string, body: unknown, cookie = '') =>
  app.request(`/api/v1/auth${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });

/** The code in the newest email printed for this address. */
async function lastCode(email: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const sent = printed.findLastIndex((line) => line.includes(`To:      ${email}`));
    const code = sent >= 0 ? printed.slice(sent).join('\n').match(/Your code: (\d{6})/)?.[1] : undefined;
    if (code) return code;
    await Bun.sleep(20);
  }
  throw new Error(`No code emailed to ${email}`);
}

const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0');

describe('Email codes', () => {
  it('confirms an email with the code, signs in and answers with me', async () => {
    const email = 'code-verify@test.com';
    expect((await post('/sign-up/email', { email, name: 'Code Verify', password: 'StrongPassword123!' })).status).toBe(200);
    printed.length = 0;
    expect((await post('/send-verification-email', { email })).status).toBe(200);
    const code = await lastCode(email);

    // The email has both the code and the one-tap link for older apps.
    const mail = printed.join('\n');
    expect(mail).toContain(`Subject: ${code} is your Restora code`);
    expect(mail).toContain('/verify-email?token=');

    // Only a hash is stored.
    const stored = await mongoose.connection.db!.collection('verification').findOne({ identifier: `email-verification-otp-${email}` });
    expect(stored).toBeTruthy();
    expect(stored!.value).not.toContain(code);

    const res = await post('/email-otp/verify-email', { email, otp: code });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session_token');
    const body = (await res.json()) as Json;
    expect(body.user.emailVerified).toBe(true);
    expect(body.me.user.email).toBe(email);

    // A code works once.
    expect((await post('/email-otp/verify-email', { email, otp: code })).status).toBe(400);
  });

  it('ends a code after 5 wrong tries', async () => {
    const email = 'code-tries@test.com';
    await post('/sign-up/email', { email, name: 'Code Tries', password: 'StrongPassword123!' });
    printed.length = 0;
    await post('/send-verification-email', { email });
    const code = await lastCode(email);

    for (let i = 0; i < 5; i++) {
      expect(((await (await post('/email-otp/verify-email', { email, otp: wrong(code) })).json()) as Json).code).toBe('INVALID_OTP');
    }
    const res = await post('/email-otp/verify-email', { email, otp: code });
    expect(res.status).toBe(403);
    expect(((await res.json()) as Json).code).toBe('TOO_MANY_ATTEMPTS');
  });

  it('resets a password with the code, and signs out every device', async () => {
    const email = 'code-reset@test.com';
    const signedUp = await post('/sign-up/email', { email, name: 'Code Reset', password: 'StrongPassword123!' });
    const cookie = signedUp.headers.get('set-cookie') || '';
    printed.length = 0;
    expect((await post('/request-password-reset', { email, redirectTo: '/reset-password' })).status).toBe(200);
    const code = await lastCode(email);
    const mail = printed.join('\n');
    expect(mail).toContain(`Subject: ${code} is your Restora password reset code`);
    expect(mail).toContain('/reset-password/');

    expect((await post('/email-otp/reset-password', { email, otp: wrong(code), password: 'NewPassword456!' })).status).toBe(400);
    expect((await post('/email-otp/reset-password', { email, otp: code, password: 'NewPassword456!' })).status).toBe(200);

    expect((await app.request('/api/v1/me', { headers: { Cookie: cookie } })).status).toBe(401);
    expect((await post('/sign-in/email', { email, password: 'StrongPassword123!' })).status).toBe(401);
    expect((await post('/sign-in/email', { email, password: 'NewPassword456!' })).status).toBe(200);
    expect((await post('/email-otp/reset-password', { email, otp: code, password: 'Another789!x' })).status).toBe(400);
  });

  it('keeps the code routes it does not use switched off', async () => {
    expect((await post('/sign-in/email-otp', { email: 'code-verify@test.com', otp: '123456' })).status).toBe(404);
    expect((await post('/email-otp/send-verification-otp', { email: 'code-verify@test.com', type: 'sign-in' })).status).toBe(404);
  });
});
