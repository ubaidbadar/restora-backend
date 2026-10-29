import type { Context } from 'hono';
import type { PipelineStage } from 'mongoose';
import Order from '../models/order';
import Customer from '../models/customer';
import Branch from '../models/branch';
import dayRange from '../utils/day_range';
import lookup from '../utils/lookup';
import { hasPermission } from '../middlewares/permission_guard';

export async function getDashboard(c: Context) {
  // The client asks `?scope=all` for every branch, `?scope=branch` for the active one.
  const wantsAll = c.req.query('scope') === 'all';
  const branchId = c.get('branchId') as string | undefined;
  const isAllBranches = wantsAll || !branchId;
  // `?from=&to=` for a span of days, `?date=` for one, today when neither.
  const range = dayRange(c);

  if (!range) {
    return c.json({ message: 'Use dates like 2026-01-31, with from on or before to' }, 400);
  }
  const days = { $gte: range.from, $lte: range.to };
  if (isAllBranches && !(await hasPermission(c, 'reports:view_all_branches'))) {
    return c.json({ message: 'You can only see the numbers of your branch' }, 403);
  }

  // 1. Order Aggregation Pipeline: sales from the days' orders, cancelled ones counted apart (guests' orders waiting to
  // be accepted are in neither).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderMatch: Record<string, any> = {
    dayKey: days,
    status: { $ne: 'pending' },
  };
  const notCancelled: PipelineStage.Match = { $match: { status: { $ne: 'cancelled' } } };

  if (!isAllBranches) {
    orderMatch.branchId = branchId;
  }

  const orderStatsPipeline: PipelineStage[] = [
    { $match: orderMatch },
    {
      $facet: {
        summary: [
          notCancelled,
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
          notCancelled,
          {
            $group: {
              _id: '$type',
              count: { $sum: 1 },
              sales: { $sum: '$total' },
            },
          },
        ],
        // Why orders were cancelled: how many and what they were worth, per reason (none for older cancellations).
        cancelled: [
          { $match: { status: 'cancelled' } },
          { $group: { _id: { $ifNull: ['$cancellation.reason', null] }, count: { $sum: 1 }, value: { $sum: '$total' } } },
          { $sort: { count: -1, value: -1 } },
          { $project: { _id: 0, reason: '$_id', count: 1, value: 1 } },
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

  const cancelledByReason: { reason: string | null; count: number; value: number }[] = orderResults?.cancelled ?? [];
  const cancelled = {
    count: cancelledByReason.reduce((sum, row) => sum + row.count, 0),
    value: cancelledByReason.reduce((sum, row) => sum + row.value, 0),
    byReason: cancelledByReason,
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
  // Midnight in Pakistan time (UTC+5, no daylight saving), from the first day to the end of the last.
  const rangeStart = new Date(`${range.from}T00:00:00.000+05:00`);
  const rangeEnd = new Date(new Date(`${range.to}T00:00:00.000+05:00`).getTime() + 86_400_000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // One aggregation over the customers for all four numbers.
  const [customerStats] = await Customer.aggregate([
    {
      $facet: {
        khata: [{ $match: { khataBalance: { $gt: 0 } } }, { $group: { _id: null, khataTotal: { $sum: '$khataBalance' }, khataCustomers: { $sum: 1 } } }],
        newInRange: [{ $match: { createdAt: { $gte: rangeStart, $lt: rangeEnd } } }, { $count: 'n' }],
        // Slipping away: ordered before, but not in the last 30 days. Someone who never ordered is new, not slipping.
        slippingTotal: [{ $match: { lastOrderAt: { $lte: thirtyDaysAgo } } }, { $count: 'n' }],
        slipping: [{ $match: { lastOrderAt: { $lte: thirtyDaysAgo } } }, { $sort: { totalSpent: -1, orderCount: -1 } }, { $limit: 10 }, { $project: { addresses: 0, notes: 0 } }],
      },
    },
  ]);
  const customerKhataStats = customerStats?.khata ?? [];
  const newCustomersCount = customerStats?.newInRange[0]?.n ?? 0;
  const slippingTotal = customerStats?.slippingTotal[0]?.n ?? 0;
  const slippingCustomers = customerStats?.slipping ?? [];

  const khataStats = customerKhataStats[0] || { khataTotal: 0, khataCustomers: 0 };

  // 3. Per Branch Breakdown (when All branches requested)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let perBranch: any[] = [];
  if (isAllBranches) {
    // One aggregation: each open branch with the days' sales and order count.
    perBranch = await Branch.aggregate([
      { $match: { archivedAt: { $exists: false } } },
      { $sort: { name: 1 } },
      { $set: { _id: { $toString: '$_id' } } },
      ...lookup({
        from: Order,
        localField: '_id',
        foreignField: 'branchId',
        as: 'stats',
        pipeline: [
          { $match: { restaurantId: c.get('restaurantId'), dayKey: days, status: { $ne: 'pending' } } },
          {
            $group: {
              _id: null,
              sales: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, '$total'] } },
              orderCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 0, 1] } },
              cancelledCount: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
            },
          },
        ],
      }),
      { $set: { stats: { $first: '$stats' } } },
      {
        $project: {
          _id: 0,
          branch: { $unsetField: { field: 'stats', input: '$$ROOT' } },
          sales: { $ifNull: ['$stats.sales', 0] },
          orderCount: { $ifNull: ['$stats.orderCount', 0] },
          cancelledCount: { $ifNull: ['$stats.cancelledCount', 0] },
        },
      },
    ]);
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
      cancelled,
    },
    perBranch,
    slipping: slippingCustomers,
    slippingTotal,
  });
}

export default {
  get: getDashboard,
};
