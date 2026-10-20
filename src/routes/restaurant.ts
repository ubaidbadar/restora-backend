import { Hono } from 'hono';
import restaurantController from '../controllers/restaurant';
import validateBody from '../validations/validator';
import onboardingSchema from '../validations/onboarding';
import { transferOwnershipSchema, deleteRestaurantSchema } from '../validations/restaurant_owner';
import requireWeb from '../middlewares/require_web';
import requireFreshSession from '../middlewares/require_fresh_session';

const restaurantRouter = new Hono();

// All of these act on the person's own account, never from a shared terminal.
restaurantRouter.get('/restaurants', requireWeb, restaurantController.list);
restaurantRouter.post('/restaurants/:id/keep', requireWeb, restaurantController.keepRestaurant);
restaurantRouter.post('/onboarding', requireWeb, validateBody(onboardingSchema), restaurantController.onboarding);
restaurantRouter.post('/restaurant/transfer', requireWeb, requireFreshSession, validateBody(transferOwnershipSchema), restaurantController.transferOwnership);
restaurantRouter.post('/restaurant/delete', requireWeb, requireFreshSession, validateBody(deleteRestaurantSchema), restaurantController.deleteRestaurant);
restaurantRouter.post('/restaurant/leave', requireWeb, restaurantController.leaveRestaurant);

export default restaurantRouter;
