import { Hono } from 'hono';
import pushDeviceController from '../controllers/push_device';
import { requireMember } from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { pushDeviceRemoveSchema, pushDeviceSchema } from '../validations/push_device';

const pushDeviceRouter = new Hono();

pushDeviceRouter.get('/web-key', pushDeviceController.webKey);
pushDeviceRouter.post('/', requireMember, validateBody(pushDeviceSchema), pushDeviceController.save);
pushDeviceRouter.post('/remove', validateBody(pushDeviceRemoveSchema), pushDeviceController.remove);

export default pushDeviceRouter;
