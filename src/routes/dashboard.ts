import { Hono } from 'hono';
import dashboardController from '../controllers/dashboard';
import requirePermission from '../middlewares/permission_guard';

const dashboardRouter = new Hono();

dashboardRouter.get('/', requirePermission('reports:view'), dashboardController.get);

export default dashboardRouter;
