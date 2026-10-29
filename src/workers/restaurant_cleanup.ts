import Restaurant from '../models/restaurant';
import Branch from '../models/branch';
import Customer from '../models/customer';
import Order from '../models/order';
import MenuItem from '../models/menu_item';
import MenuCategory from '../models/menu_category';
import AddonGroup from '../models/addon_group';
import Role from '../models/role';
import StaffMember from '../models/staff_member';
import Invitation from '../models/invitation';
import Settings from '../models/settings';
import Device from '../models/device';
import Team from '../models/team';
import KhataEntry from '../models/khata_entry';
import AuditEntry from '../models/audit_entry';
import GuestRequest from '../models/guest_request';
import Table from '../models/table';
import Reservation from '../models/reservation';
import DailyCounter from '../models/daily_counter';
import PrintAgent from '../models/print_agent';
import PrintJob from '../models/print_job';
import PushDevice from '../models/push_device';
import { runWithoutTenant } from '../middlewares/tenant_context';

export async function cleanupExpiredRestaurants(): Promise<number> {
  const now = new Date().toISOString();

  const expired = await runWithoutTenant(() =>
    Restaurant.find({
      status: 'deleting',
      deleteAfter: { $lte: now },
    })
  );

  let deletedCount = 0;

  for (const restaurant of expired) {
    const restaurantId = String(restaurant._id);
    console.log(`[Restaurant Cleanup] Permanently deleting restaurant: ${restaurant.name} (${restaurantId})`);

    await runWithoutTenant(async () => {
      await Promise.all([
        Branch.deleteMany({ restaurantId }),
        Customer.deleteMany({ restaurantId }),
        Order.deleteMany({ restaurantId }),
        MenuItem.deleteMany({ restaurantId }),
        MenuCategory.deleteMany({ restaurantId }),
        AddonGroup.deleteMany({ restaurantId }),
        Role.deleteMany({ restaurantId }),
        StaffMember.deleteMany({ restaurantId }),
        Invitation.deleteMany({ restaurantId }),
        Settings.deleteMany({ restaurantId }),
        Device.deleteMany({ restaurantId }),
        Team.deleteMany({ restaurantId }),
        KhataEntry.deleteMany({ restaurantId }),
        AuditEntry.deleteMany({ restaurantId }),
        GuestRequest.deleteMany({ restaurantId }),
        Table.deleteMany({ restaurantId }),
        Reservation.deleteMany({ restaurantId }),
        DailyCounter.deleteMany({ restaurantId }),
        PrintAgent.deleteMany({ restaurantId }),
        PrintJob.deleteMany({ restaurantId }),
        PushDevice.deleteMany({ restaurantId }),
      ]);

      await Restaurant.findByIdAndDelete(restaurantId);
    });

    deletedCount++;
  }

  return deletedCount;
}

export function startRestaurantCleanupWorker(intervalMs = 60 * 60 * 1000): Timer {
  console.log('[Restaurant Cleanup Worker] Started');
  // Run once shortly after start
  setTimeout(() => {
    cleanupExpiredRestaurants().catch((err) =>
      console.error('[Restaurant Cleanup Worker] Error during run:', err)
    );
  }, 10000);

  return setInterval(() => {
    cleanupExpiredRestaurants().catch((err) =>
      console.error('[Restaurant Cleanup Worker] Error during run:', err)
    );
  }, intervalMs);
}

export default startRestaurantCleanupWorker;
