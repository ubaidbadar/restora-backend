import type { Context } from 'hono';
import Order from '../models/order';
import Customer from '../models/customer';
import Branch from '../models/branch';
import dayKey from '../utils/day_key';
import { hasPermission } from '../middlewares/permission_guard';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function getDashboard(c: Context) {
  // The client asks `?scope=all` for every branch, `?scope=branch` for the active one.
  const wantsAll = c.req.query('scope') === 'all';
  const branchId = c.get('branchId') as string | undefined;
  const isAllBranches = wantsAll || !branchId;
  const today = c.req.query('date') || dayKey();

  if (!DAY.test(today)) {
    return c.json({ message: 'Use a date like 2026-01-31' }, 400);
  }
  if (isAllBranches && !(await hasPermission(c, 'reports:view_all_branches'))) {
    return c.json({ message: 'You can only see the numbers of your branch' }, 403);
  }

  // 1. Order Aggregation Pipeline
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderMatch: Record<string, any> = {
    dayKey: today,
    status: { $ne: 'cancelled' },
  };

  if (!isAllBranches) {
    orderMatch.branchId = branchId;
  }

  const orderStatsPipeline = [
    { $match: orderMatch },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              sales: { $sum: '$total' },
              orderCount: { $sum: 1 },
              cash: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$paymentMethod', 'cash'] },
                        { $eq: ['$paymentStatus', 'paid'] },
                      ],
                    },
                    '$total',
                    0,
                  ],
                },
              },
              digital: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $in: ['$paymentMethod', ['card', 'jazzcash', 'easypaisa', 'bank']] },
                        { $eq: ['$paymentStatus', 'paid'] },
                      ],
                    },
                    '$total',
                    0,
                  ],
                },
              },
              notCollected: {
                $sum: {
                  $cond: [
                    { $in: ['$paymentStatus', ['unpaid', 'khata']] },
                    '$total',
                    0,
                  ],
                },
              },
            },
          },
        ],
        byType: [
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              sales: { $sum: '$total' },
            },
          },
        ],
      },
    },
  ];

  const [orderResults] = await Order.aggregate(orderStatsPipeline);

  const summary = orderResults?.summary?.[0] || {
    sales: 0,
    orderCount: 0,
    cash: 0,
    digital: 0,
    notCollected: 0,
  };

  const types = ['dine_in', 'takeaway', 'delivery'] as const;
  const rawByType = orderResults?.byType || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byTypeMap = new Map<string, any>(rawByType.map((b: any) => [b._id, b]));
  const byType = types.map((t) => ({
    type: t,
    count: byTypeMap.get(t)?.count || 0,
    sales: byTypeMap.get(t)?.sales || 0,
  }));

  // 2. Customer Aggregations (new customers, khata totals, slipping)
  // Midnight in Pakistan time (UTC+5, no daylight saving).
  const todayStart = new Date(`${today}T00:00:00.000+05:00`);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [customerKhataStats, newCustomersCount, slippingTotal, slippingCustomers] =
    await Promise.all([
      Customer.aggregate([
        { $match: { khataBalance: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            khataTotal: { $sum: '$khataBalance' },
            khataCustomers: { $sum: 1 },
          },
        },
      ]),
      Customer.countDocuments({ createdAt: { $gte: todayStart, $lt: todayEnd } }),
      // Slipping away: ordered before, but not in the last 30 days. Someone who never ordered is new, not slipping.
      Customer.countDocuments({
        lastOrderAt: { $lte: thirtyDaysAgo },
      }),
      Customer.find({
        lastOrderAt: { $lte: thirtyDaysAgo },
      })
        .select('-addresses -notes')
        .sort({ totalSpent: -1, orderCount: -1 })
        .limit(10),
    ]);

  const khataStats = customerKhataStats[0] || { khataTotal: 0, khataCustomers: 0 };

  // 3. Per Branch Breakdown (when All branches requested)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let perBranch: any[] = [];
  if (isAllBranches) {
    const branches = await Branch.find({ archivedAt: { $exists: false } }).sort({ name: 1 });
    const branchOrderStats = await Order.aggregate([
      {
        $match: {
          dayKey: today,
          status: { $ne: 'cancelled' },
        },
      },
      {
        $group: {
          _id: '$branchId',
          sales: { $sum: '$total' },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const branchMap = new Map<string, any>(branchOrderStats.map((s: any) => [s._id, s]));

    perBranch = branches.map((b) => {
      const stats = branchMap.get(String(b._id)) || { sales: 0, orderCount: 0 };
      return {
        branch: b,
        sales: stats.sales,
        orderCount: stats.orderCount,
      };
    });
  }

  return c.json({
    stats: {
      sales: summary.sales,
      orderCount: summary.orderCount,
      byType,
      cash: summary.cash,
      digital: summary.digital,
      notCollected: summary.notCollected,
      newCustomers: newCustomersCount,
      khataTotal: khataStats.khataTotal,
      khataCustomers: khataStats.khataCustomers,
    },
    perBranch,
    slipping: slippingCustomers,
    slippingTotal,
  });
}

export default {
  get: getDashboard,
};
