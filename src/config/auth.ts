import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { mongodbAdapter } from 'better-auth/adapters/mongodb';
import { emailOTP } from 'better-auth/plugins/email-otp';
import { multiSession } from 'better-auth/plugins/multi-session';
import { createAuthMiddleware } from 'better-auth/api';
import mongoose from 'mongoose';
import allowedOrigins from '../constants/allowed_origins';
import { sendAccountEmail } from '../services/email';
import { sessionWorkplace, toMe } from '../utils/workplace';

/** Answers that start a sign-in also carry `me`, so the app has everything without a second request. */
const CARRY_ME = new Set(['/sign-in/email', '/sign-in/social', '/email-otp/verify-email', '/multi-session/set-active', '/multi-session/revoke']);

/** Emailed codes and links both work for 10 minutes. */
const CODE_LIFETIME = 600;

const DEV_SECRET = 'restaurant-v2-dev-only-secret-not-for-production';

/** The mobile app's own scheme; in development also Expo Go's. */
const MOBILE_ORIGINS = process.env.NODE_ENV === 'production' ? ['restora://'] : ['restora://', 'exp://'];

/** Which sign-in buttons the apps show. The web needs Google's client secret; the app only sends Google's ID token. */
export function signInProviders() {
  const google = Boolean(process.env.GOOGLE_CLIENT_ID);
  return {
    web: google && process.env.GOOGLE_CLIENT_SECRET ? ['google'] : [],
    app: google ? ['google'] : [],
  };
}

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
      // Nobody signs in until they confirm their email; invitations are bound to an email, so it must be theirs.
      // Tests turn this off (they sign up and continue straight away).
      requireEmailVerification: process.env.NODE_ENV !== 'test',
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: CODE_LIFETIME,
      // POST /request-password-reset sends a code (for /email-otp/reset-password) and the old link, which older apps use.
      sendResetPassword: async ({ user, url }) => {
        const code = await getAuth().api.createVerificationOTP({ body: { email: user.email, type: 'forget-password' } });
        await sendAccountEmail({
          to: user.email,
          subject: `${code} is your Restora password reset code`,
          art: 'reset',
          heading: 'Reset your password',
          body: 'Someone asked to reset the password of your Restora account. If it was you, enter this code in Restora to choose a new one.',
          code,
          buttonLabel: 'Or choose a new password here',
          url,
          note: 'The code and the link work for 10 minutes. Did not ask for this? Ignore this email; your password stays the same.',
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Signing in before verifying sends a fresh email.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: CODE_LIFETIME,
      // A code for /email-otp/verify-email, and the old one-tap link, which older apps use.
      sendVerificationEmail: async ({ user, url }) => {
        const code = await getAuth().api.createVerificationOTP({ body: { email: user.email, type: 'email-verification' } });
        await sendAccountEmail({
          to: user.email,
          subject: `${code} is your Restora code`,
          art: 'verify',
          heading: 'Confirm your email',
          body: 'Enter this code in Restora to confirm your email and start using it.',
          code,
          buttonLabel: 'Or confirm with one tap',
          url,
          note: 'The code and the link work for 10 minutes. Did not sign up for Restora? You can ignore this email.',
        });
      },
    },
    // Google: the web goes through Google's page and back to /callback/google; the app signs in natively and sends the
    // ID token to /sign-in/social. Android's token is issued to the web client, the iPhone's to the iOS client.
    // Off until GOOGLE_CLIENT_ID is set. A Google email joins an existing account only once that account confirmed it.
    socialProviders: process.env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter((id): id is string => Boolean(id)),
            clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            prompt: 'select_account',
          },
        }
      : {},
    databaseHooks: {
      user: {
        create: {
          // An account is bound to its email (invitations), so one made by Google needs Google to have confirmed it.
          before: async (user, ctx) => (ctx?.path === '/sign-up/email' || user.emailVerified ? undefined : false),
        },
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
        const found = await sessionWorkplace(started.user.id, started.session as typeof started.session & { activeRestaurantId?: string | null; activeBranchId?: string | null });
        return ctx.json({ ...(returned as object), me: toMe({ user: started.user, via: 'web', ...found }) });
      }),
    },
    // Of the code routes only /email-otp/verify-email and /email-otp/reset-password are used. Signing in with a code
    // would skip the password, so it stays off with the rest.
    disabledPaths: [
      '/email-otp/send-verification-otp',
      '/email-otp/check-verification-otp',
      '/email-otp/request-password-reset',
      '/forget-password/email-otp',
      '/sign-in/email-otp',
      '/email-otp/request-email-change',
      '/email-otp/change-email',
    ],
    plugins: [
      multiSession(),
      expo(),
      // Codes are made in the two senders above; the plugin checks them. Only a hash is stored, 5 wrong tries end a code.
      emailOTP({
        expiresIn: CODE_LIFETIME,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        rateLimit: { window: 60, max: 5 },
        // Never called: the plugin's own sending routes are switched off above.
        sendVerificationOTP: async () => {},
      }),
    ],
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
