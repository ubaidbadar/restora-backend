import { Hono } from 'hono';
import settingsController from '../controllers/settings';
import requirePermission, { requireMember } from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { settingsUpdateSchema } from '../validations/settings';

const settingsRouter = new Hono();

// Everyone at the restaurant reads it: the order screen needs the tax rates, receipts need the name and logo.
settingsRouter.get('/', requireMember, settingsController.get);
settingsRouter.patch('/', requirePermission('settings:manage'), validateBody(settingsUpdateSchema), settingsController.update);
settingsRouter.post('/logo', requirePermission('settings:manage'), settingsController.uploadLogo);

export default settingsRouter;
