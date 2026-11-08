import { Hono } from 'hono';
import { z } from 'zod';
import { platformAdminGuard } from '../middlewares/platform_admin_guard';
import validateBody from '../validations/validator';
import { adminMe, overview, listRestaurants, restaurantDetails, listPlatformTeam, upsertPlatformTeam } from '../controllers/platform_admin';

const router = new Hono();
router.use('*', platformAdminGuard);
router.get('/me', adminMe);
router.get('/overview', overview);
router.get('/restaurants', listRestaurants);
router.get('/restaurants/:id', restaurantDetails);
router.get('/team', listPlatformTeam);
router.put('/team', validateBody(z.object({
  userId: z.string().min(3).max(128),
  role: z.enum(['analyst', 'support']),
  enabled: z.boolean(),
})), upsertPlatformTeam);
export default router;
