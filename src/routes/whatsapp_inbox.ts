import { Hono } from 'hono';
import { whatsappSignupConfig, connectWhatsApp, registerNumber, disconnectNumber } from '../controllers/whatsapp_onboarding';
import { z } from 'zod';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { getConversation, listConversations, readConversation, replyToConversation, listWhatsAppConnections, updateWhatsAppConnection, listWhatsAppInvoices, retryWhatsAppInvoice } from '../controllers/whatsapp_inbox';

const router = new Hono();
const replySchema = z.object({
  phoneNumberId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(4096),
});
router.get('/signup/config', requirePermission('devices:manage'), whatsappSignupConfig);
router.post('/signup/complete', requirePermission('devices:manage'), validateBody(z.object({
  code: z.string().min(10).max(4096),
  wabaId: z.string().regex(/^\d{5,30}$/).optional(),
  phoneNumberId: z.string().regex(/^\d{5,30}$/).optional(),
})), connectWhatsApp);
router.post('/connections/:id/register', requirePermission('devices:manage'), validateBody(z.object({
  pin: z.string().regex(/^\d{6}$/, 'Enter a six-digit registration PIN'),
})), registerNumber);
router.post('/connections/:id/disconnect', requirePermission('devices:manage'), disconnectNumber);
router.get('/connections', requirePermission('devices:manage'), listWhatsAppConnections);
router.patch('/connections/:id', requirePermission('devices:manage'), validateBody(z.object({ invoiceOnComplete: z.boolean() })), updateWhatsAppConnection);
router.get('/invoices', requirePermission('orders:view'), listWhatsAppInvoices);
router.post('/orders/:orderId/invoice/retry', requirePermission('orders:update'),
  validateBody(z.object({ stage: z.enum(['confirmed', 'completed']).optional() })), retryWhatsAppInvoice);
router.get('/conversations', requirePermission('orders:view'), listConversations);
router.get('/conversations/:phone', requirePermission('orders:view'), getConversation);
router.post('/conversations/:phone/read', requirePermission('orders:view'), validateBody(z.object({
  phoneNumberId: z.string().min(1).max(100),
  messageId: z.string().min(1).max(255),
})), readConversation);
router.post('/conversations/:phone/reply', requirePermission('orders:update'), validateBody(replySchema), replyToConversation);
export default router;
