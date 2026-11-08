import { Hono } from 'hono';
import { z } from 'zod';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { getConversation, listConversations, replyToConversation, listWhatsAppConnections, updateWhatsAppConnection } from '../controllers/whatsapp_inbox';

const router = new Hono();
const replySchema = z.object({
  phoneNumberId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(4096),
});
router.get('/connections', requirePermission('devices:manage'), listWhatsAppConnections);
router.patch('/connections/:id', requirePermission('devices:manage'), validateBody(z.object({ invoiceOnComplete: z.boolean() })), updateWhatsAppConnection);
router.get('/conversations', requirePermission('orders:view'), listConversations);
router.get('/conversations/:phone', requirePermission('orders:view'), getConversation);
router.post('/conversations/:phone/reply', requirePermission('orders:update'), validateBody(replySchema), replyToConversation);
export default router;
