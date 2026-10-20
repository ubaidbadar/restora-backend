import { Hono } from 'hono';
import publicMenuController from '../controllers/public_menu';
import validateBody from '../validations/validator';
import publicCallSchema from '../validations/public_call';
import publicOptInSchema from '../validations/public_opt_in';

const publicRouter = new Hono();

publicRouter.get('/t/:code', publicMenuController.getMenu);
publicRouter.post('/t/:code/call', validateBody(publicCallSchema), publicMenuController.call);
publicRouter.post('/t/:code/opt-in', validateBody(publicOptInSchema), publicMenuController.optIn);

export default publicRouter;
