import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { multiSession } from 'better-auth/plugins/multi-session';
import { createAuthMiddleware } from 'better-auth/api';
import mongoose from 'mongoose';
import allowedOrigins from '../constants/allowed_origins';
import { sendAccountEmail } from '../services/email';
import { meForSession } from '../utils/workplace';

/** Answers that start a sign-in also carry `me`, so the app has everything without a second request. */
const CARRY_ME = new Set(['/sign-in/email', '/multi-session/set-active', '/multi-session/revoke']);

const DEV_SECRET = 'restaurant-v2-dev-only-secret-not-for-production';

/** The mobile app's own scheme; in development also Expo Go's. */
const MOBILE_ORIGINS = process.env.NODE_ENV === 'production' ? ['restora://'] : ['restora://', 'exp://'];

function authSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BETTER_AUTH_SECRET must be set (32+ characters) in production');
  }
  return DEV_SECRET;
}

function createAuth() {
  const db = mongoose.connection.getClient().db();

  return betterAuth({
    database: mongodbAdapter(db, { transaction: false }),
    // The client calls /api/v1/auth/* through its axios base URL.
    basePath: '/api/v1/auth',
    // The app's public address, not the API port: links in emails go to <app>/api/v1/auth/…, which the app
    // forwards to this server, and the redirect after (e.g. callbackURL "/") then lands in the app.
    baseURL: process.env.BETTER_AUTH_URL || allowedOrigins[0],
    secret: authSecret(),
    // The mobile app (scheme restora://) signs in from outside a browser; the expo() plugin below reads its origin.
    trustedOrigins: [...allowedOrigins, ...MOBILE_ORIGINS],
    emailAndPassword: {
      enabled: true,
      // Nobody signs in until they open the link we email; invitations are bound to an email, so it must be theirs.
      // Tests turn this off (they sign up and continue straight away).
      requireEmailVerification: process.env.NODE_ENV !== 'test',
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAccountEmail({
          to: user.email,
          subject: 'Reset your Restora password',
          art: 'reset',
          heading: 'Reset your password',
          body: 'Someone asked to reset the password of your Restora account. If it was you, choose a new one below.',
          buttonLabel: 'Choose a new password',
          url,
          note: 'The link works for one hour. Did not ask for this? Ignore this email; your password stays the same.',
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in before verifying sends a fresh link.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAccountEmail({
          to: user.email,
          subject: 'Confirm your email for Restora',
          art: 'verify',
          heading: 'Confirm your email',
          body: 'One tap and you are in. Confirm this is your email address to start using Restora.',
          buttonLabel: 'Confirm my email',
          url,
          note: 'The link works for one hour. Did not sign up for Restora? You can ignore this email.',
        });
      },
    },
    session: {
      // Where this sign-in works now. Set only by the server (POST /me/workplace, /me/branch, onboarding, joining).
      additionalFields: {
        activeRestaurantId: { type: 'string', required: false, input: false },
        activeBranchId: { type: 'string', required: false, input: false },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (!CARRY_ME.has(ctx.path)) return;
        const returned = ctx.context.returned;
        const started = ctx.context.newSession;
        if (!started || !returned || returned instanceof Error) return;
        const me = await meForSession(started.user, started.session as typeof started.session & { activeRestaurantId?: string | null; activeBranchId?: string | null });
        return ctx.json({ ...(returned as object), me });
      }),
    },
    plugins: [multiSession(), expo()],
  });
}

let authInstance: ReturnType<typeof createAuth> | null = null;
let authClient: unknown = null;

/** Created on first use, after Mongoose has connected, and again if Mongoose reconnects with a new client. */
export function getAuth() {
  const client = mongoose.connection.getClient();
  if (!authInstance || authClient !== client) {
    authInstance = createAuth();
    authClient = client;
  }
  return authInstance;
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop) {
    return getAuth()[prop as keyof ReturnType<typeof createAuth>];
  },
});

export default auth;
