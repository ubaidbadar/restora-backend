import { Hono } from 'hono';
import deviceController from '../controllers/device';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import deviceRegisterSchema, { deviceUpdateSchema } from '../validations/device';

const deviceRouter = new Hono();

deviceRouter.get('/', requirePermission('devices:manage'), deviceController.list);
deviceRouter.post('/', requirePermission('devices:manage'), validateBody(deviceRegisterSchema), deviceController.register);
deviceRouter.patch('/:id', requirePermission('devices:manage'), validateBody(deviceUpdateSchema), deviceController.update);
deviceRouter.delete('/:id', requirePermission('devices:manage'), deviceController.delete);

export default deviceRouter;
