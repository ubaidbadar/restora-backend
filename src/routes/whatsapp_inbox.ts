import { Hono } from 'hono';
import { z } from 'zod';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { getConversation, listConversations, replyToConversation } from '../controllers/whatsapp_inbox';

const router = new Hono();
const replySchema = z.object({
  phoneNumberId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(4096),
});
router.get('/conversations', requirePermission('orders:view'), listConversations);
router.get('/conversations/:phone', requirePermission('orders:view'), getConversation);
router.post('/conversations/:phone/reply', requirePermission('orders:update'), validateBody(replySchema), replyToConversation);
export default router;
