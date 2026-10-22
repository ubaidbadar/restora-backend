import { Hono } from 'hono';
import { signInProviders } from '../config/auth';
import publicMenuController from '../controllers/public_menu';
import validateBody from '../validations/validator';
import publicCallSchema from '../validations/public_call';
import publicOptInSchema from '../validations/public_opt_in';
import publicOrderSchema from '../validations/public_order';

const publicRouter = new Hono();

// The sign-in buttons the apps show: { web: ['google'], app: ['google'] }, empty while a provider is not configured.
publicRouter.get('/sign-in-providers', (c) => c.json(signInProviders()));

publicRouter.get('/t/:code', publicMenuController.getMenu);
publicRouter.post('/t/:code/call', validateBody(publicCallSchema), publicMenuController.call);
publicRouter.post('/t/:code/order', validateBody(publicOrderSchema), publicMenuController.order);
publicRouter.post('/t/:code/opt-in', validateBody(publicOptInSchema), publicMenuController.optIn);

export default publicRouter;
