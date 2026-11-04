import { Hono } from 'hono';
import { receiveWebhook, verifyWebhook } from '../controllers/whatsapp_webhook';

/**
 * WhatsApp Cloud API webhook router.
 * Mounted on the /api/v1 app BEFORE authGuard/tenantResolver in
 * index.ts (the public-route pattern): Meta calls it unauthenticated,
 * and it authenticates itself via the verify token (GET) and the
 * HMAC signature (POST). It must never be moved below authGuard.
 */
const whatsappRouter = new Hono();

whatsappRouter.get('/whatsapp', verifyWebhook);
whatsappRouter.post('/whatsapp', receiveWebhook);

export default whatsappRouter;
