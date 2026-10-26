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

// A table's code is `restaurant/table-key` (two parts); tables made before that have one random part.
for (const table of ['/t/:code', '/t/:restaurant/:table']) {
  publicRouter.get(table, publicMenuController.getMenu);
  publicRouter.get(`${table}/stream`, publicMenuController.stream);
  publicRouter.get(`${table}/orders`, publicMenuController.getOrders);
  publicRouter.post(`${table}/call`, validateBody(publicCallSchema), publicMenuController.call);
  publicRouter.post(`${table}/order`, validateBody(publicOrderSchema), publicMenuController.order);
  publicRouter.post(`${table}/opt-in`, validateBody(publicOptInSchema), publicMenuController.optIn);
}

export default publicRouter;
