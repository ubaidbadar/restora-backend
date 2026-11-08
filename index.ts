import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { timing } from 'hono/timing';
import { trimTrailingSlash } from 'hono/trailing-slash';
import mongoose from 'mongoose';
import path from 'path';

import auth from './src/config/auth';
import allowedOrigins from './src/constants/allowed_origins';
import errorHandler from './src/middlewares/error_handler';
import authGuard from './src/middlewares/auth_guard';
import tenantResolver from './src/middlewares/tenant_resolver';

import branchRouter from './src/routes/branch';
import customerRouter from './src/routes/customer';
import menuRouter from './src/routes/menu';
import orderRouter from './src/routes/order';
import tableRouter from './src/routes/table';
import reservationRouter from './src/routes/reservation';
import roleRouter from './src/routes/role';
import staffRouter from './src/routes/staff';
import teamRouter from './src/routes/team';
import settingsRouter from './src/routes/settings';
import restaurantRouter from './src/routes/restaurant';
import deviceRouter from './src/routes/device';
import posRouter from './src/routes/pos';
import printAgentRouter from './src/routes/print_agent';
import printAgentLinkRouter from './src/routes/print_agent_link';
import printJobRouter from './src/routes/print_job';
import pushDeviceRouter from './src/routes/push_device';
import dashboardRouter from './src/routes/dashboard';
import auditRouter from './src/routes/audit';
import publicRouter from './src/routes/public';
import whatsappRouter from './src/routes/whatsapp';
import whatsappInboxRouter from './src/routes/whatsapp_inbox';
import whatsappInboxRouter from './src/routes/whatsapp_inbox';
import guestRequestRouter from './src/routes/guest_request';
import accountRouter from './src/routes/account';
import uploadRouter from './src/routes/upload';
import site from './site/server';

import startRestaurantCleanupWorker from './src/workers/restaurant_cleanup';
import upgradeTableCodes from './src/workers/table_codes';
import upgradePhotoSizes from './src/workers/photo_sizes';

const app = new Hono();

// Global Built-in Hono Middlewares
app.use('*', timing());
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', compress());
app.use('*', trimTrailingSlash());

// CORS Configuration with Credentials support

app.use(
  '*',
  cors({
    // Only the app's own origins may make credentialed requests. Any other origin gets no CORS headers.
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-device-token',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    credentials: true,
  })
);

// Global Error Handler
app.onError(errorHandler);

// Serve locally stored uploads (used when R2 is not configured). Only raster images, never HTML or SVG.
const SERVED_IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
app.get('/uploads/*', async (c) => {
  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  const fileName = path.basename(c.req.path);
  const type = SERVED_IMAGE_TYPES[path.extname(fileName).toLowerCase()];
  const file = Bun.file(path.join(uploadDir, fileName));
  if (!type || !(await file.exists())) {
    return c.text('Not found', 404);
  }
  return new Response(file, {
    headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
});

// Better Auth lives at /api/v1/auth (the client's axios base). /api/auth is kept as an alias.
app.all('/api/v1/auth/*', (c) => auth.handler(c.req.raw));
app.all('/api/auth/*', (c) => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/auth/, '/api/v1/auth');
  return auth.handler(new Request(url.toString(), c.req.raw));
});

// Assemble /api/v1 router
const api = new Hono();

// Public unauthenticated routes
api.route('/public', publicRouter);
api.route('/webhooks', whatsappRouter);

// Everything below needs a sign-in (or an unlocked POS terminal), scoped to its restaurant.
api.use('*', authGuard);
api.use('*', tenantResolver);

// Mount resource routers
api.route('/branches', branchRouter);
api.route('/customers', customerRouter);
api.route('/menu', menuRouter);
api.route('/orders', orderRouter);
api.route('/whatsapp', whatsappInboxRouter);
api.route('/whatsapp', whatsappInboxRouter);
api.route('/tables', tableRouter);
api.route('/reservations', reservationRouter);
api.route('/roles', roleRouter);
api.route('/', staffRouter); // /members, /invitations, /my-invitations
api.route('/teams', teamRouter);
api.route('/settings', settingsRouter);
api.route('/', restaurantRouter); // /restaurants, /onboarding, /restaurant/*
api.route('/devices', deviceRouter);
api.route('/pos', posRouter);
api.route('/print-agents', printAgentRouter);
api.route('/print-agent', printAgentLinkRouter); // the agent itself: its own token
api.route('/print-jobs', printJobRouter);
api.route('/push-devices', pushDeviceRouter);
api.route('/dashboard', dashboardRouter);
api.route('/audit', auditRouter);
api.route('/guest-requests', guestRequestRouter);
api.route('/me', accountRouter);
api.route('/account', accountRouter);
api.route('/uploads', uploadRouter);

app.route('/api/v1', api);

// Health check endpoint
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// API docs: the OpenAPI spec, and a page that renders it.
const OPENAPI_SPEC = path.join(import.meta.dir, 'docs', 'openapi.yaml');
app.get('/docs/openapi.yaml', () =>
  new Response(Bun.file(OPENAPI_SPEC), { headers: { 'Content-Type': 'application/yaml; charset=utf-8' } })
);
app.get('/docs', (c) =>
  c.html(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Restora API</title>
  </head>
  <body>
    <script id="api-reference" data-url="/docs/openapi.yaml"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.25.0"></script>
  </body>
</html>`)
);

// restora.live: the marketing pages and a table's QR menu, rendered here (site/). Last, so it never shadows the API.
app.route('/', site);

const port = parseInt(process.env.PORT || '3000', 10);
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/restaurant_v2';

// Auto-connect to MongoDB if not in test environment and not already connected
if (process.env.NODE_ENV !== 'test' && mongoose.connection.readyState === 0) {
  console.log('[Database] Connecting to MongoDB');
  mongoose
    .connect(mongoUri)
    .then(() => {
      console.log('[Database] Connected to MongoDB successfully');
      startRestaurantCleanupWorker();
      upgradeTableCodes().catch((err) => console.error('[Tables] Making QR links readable failed:', err));
      upgradePhotoSizes().catch((err) => console.error('[Photos] Making small sizes failed:', err));
    })
    .catch((err) => {
      console.error('[Database] Failed to connect to MongoDB:', err);
    });
}

export { app };

export default {
  port,
  fetch: app.fetch,
};
