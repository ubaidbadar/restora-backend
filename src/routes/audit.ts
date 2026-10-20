import { Hono } from 'hono';
import auditController from '../controllers/audit';
import requirePermission from '../middlewares/permission_guard';

const auditRouter = new Hono();

auditRouter.get('/', requirePermission('audit:view'), auditController.list);

export default auditRouter;
