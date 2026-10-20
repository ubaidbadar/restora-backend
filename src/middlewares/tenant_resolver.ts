import type { Context, Next } from 'hono';
import { runWithTenant, runWithoutTenant } from './tenant_context';
import Restaurant from '../models/restaurant';

/**
 * Scopes the rest of the request to the restaurant the auth guard resolved from a membership or a POS terminal.
 * The restaurant comes from the sign-in session (or the terminal), never from the request itself.
 */
export async function tenantResolver(c: Context, next: Next) {
  const restaurantId = c.get('restaurantId') as string | undefined;

  if (restaurantId) {
    const restaurant = await runWithoutTenant(() => Restaurant.findById(restaurantId));
    if (!restaurant) {
      return c.json({ message: 'Restaurant not found' }, 404);
    }
    c.set('restaurant', restaurant);
    return runWithTenant(restaurantId, () => next());
  }

  // No restaurant: account-level routes still work, but any restaurant data query is refused.
  return runWithTenant(undefined, () => next());
}

export default tenantResolver;
