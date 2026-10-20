import { Hono } from 'hono';
import posController from '../controllers/pos';
import posDeviceGuard from '../middlewares/pos_device_guard';
import validateBody from '../validations/validator';
import posUnlockSchema from '../validations/pos';

const posRouter = new Hono();

// All POS routes require terminal device-level credentials
posRouter.use('*', posDeviceGuard);

posRouter.get('/state', posController.getState);
posRouter.get('/people', posController.getPeople);
posRouter.post('/unlock', validateBody(posUnlockSchema), posController.unlock);
posRouter.post('/lock', posController.lock);

export default posRouter;
