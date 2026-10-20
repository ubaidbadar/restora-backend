import { Hono } from 'hono';
import publicMenuController from '../controllers/public_menu';
import requirePermission from '../middlewares/permission_guard';

const guestRequestRouter = new Hono();

guestRequestRouter.post('/:id/resolve', requirePermission('tables:view'), publicMenuController.resolve);
guestRequestRouter.delete('/:id', requirePermission('tables:view'), publicMenuController.resolve);

export default guestRequestRouter;
