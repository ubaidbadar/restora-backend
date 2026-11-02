import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import Order from '../src/models/order';
import AuditEntry from '../src/models/audit_entry';
import dayKey from '../src/utils/day_key';

type Json = any;

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let restaurantId: string;
let branchId: string;

const TYPES = ['dine_in', 'takeaway', 'delivery'] as const;
const today = dayKey();
const yesterday = dayKey(Date.now() - 86_400_000);

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'history@restaurant.com', name: 'Busy Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Busy House', branchName: 'Clifton', city: 'Karachi' }),
  });
  restaurantId = ((await onboard.json()) as Json).restaurantId;
  headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;

  // 60 orders yesterday and 60 today: types in turn, every 10th cancelled, #7 for Ayesha Khan at table T7.
  const docs = [yesterday, today].flatMap((day) =>
    Array.from({ length: 60 }, (_, index) => {
      const token = index + 1;
      return {
        restaurantId,
        branchId,
        dayKey: day,
        dailyToken: token,
        type: TYPES[index % 3],
        status: token % 10 === 0 ? 'cancelled' : 'completed',
        paymentStatus: 'paid',
        items: [{ itemId: 'x', name: 'Karahi', price: 100, qty: 2 }],
        total: 200,
        ...(token === 7 ? { customer: { _id: 'c1', name: 'Ayesha Khan', phone: '+923001234567' }, tableName: 'T7' } : {}),
      };
    }),
  );
  await Order.insertMany(docs);
  const changed = await Order.findOne({ restaurantId, branchId, dayKey: today, dailyToken: 7 });
  await AuditEntry.create({ restaurantId, action: 'order.edited', actor: { via: 'web', name: 'Chef Ali' }, target: { type: 'order', id: String(changed!._id) }, changes: { after: { lines: [{ name: 'Karahi', was: 1, now: 2 }] } } });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const history = async (query: string) => {
  const res = await app.request(`/api/v1/orders/history?${query}`, { headers });
  return { status: res.status, body: (await res.json()) as Json };
};

describe('Order history', () => {
  it('answers the summary and the first 50 full orders, the latest first', async () => {
    const { status, body } = await history(`from=${yesterday}&to=${today}`);
    expect(status).toBe(200);
    expect(body.summary).toEqual({ count: 120, sales: 108 * 200, byStatus: { completed: 108, cancelled: 12 }, byType: { dine_in: 40, takeaway: 40, delivery: 40 } });
    expect(body.orders).toHaveLength(50);
    expect(body.orders[0]).toMatchObject({ dayKey: today, dailyToken: 60, itemCount: 2, total: 200 });
    expect(body.orders[0].items).toMatchObject([{ name: 'Karahi', qty: 2 }]);
    expect(body.orders[0].timeline).toEqual([]);
    expect(body.next).toBe(`${today}_11_${body.orders[49]._id}`);
  });

  it('bundles detailed dishes and audit changes in the history, order, and today endpoints', async () => {
    const { body } = await history(`from=${today}&q=7`);
    const order = body.orders[0];
    expect(order.items).toMatchObject([{ name: 'Karahi', price: 100, qty: 2 }]);
    expect(order.customer.phone).toBe('+923001234567');
    expect(order.timeline).toHaveLength(1);
    expect(order.timeline[0]).toMatchObject({
      action: 'order.edited',
      actor: { name: 'Chef Ali' },
      changes: { after: { lines: [{ name: 'Karahi', was: 1, now: 2 }] } },
    });

    const single = await app.request(`/api/v1/orders/${order._id}`, { headers });
    expect(single.status).toBe(200);
    expect(((await single.json()) as Json).timeline).toEqual(order.timeline);

    const todayResponse = await app.request('/api/v1/orders', { headers });
    const todayOrders = (await todayResponse.json()) as Json[];
    expect(todayOrders.find((item) => item._id === order._id)?.timeline).toEqual(order.timeline);
  });

  it('pages through every order once with the cursor, with no summary after the first page', async () => {
    const seen: string[] = [];
    let next: string | null = null;
    do {
      const { body }: { body: Json } = await history(`from=${yesterday}&to=${today}${next ? `&cursor=${next}` : ''}`);
      if (next) expect(body.summary).toBeUndefined();
      seen.push(...body.orders.map((order: Json) => `${order.dayKey}#${order.dailyToken}`));
      next = body.next;
    } while (next);
    expect(seen).toHaveLength(120);
    expect(new Set(seen).size).toBe(120);
    expect(seen.at(-1)).toBe(`${yesterday}#1`);
  });

  it('filters by status and type while the summary keeps every count', async () => {
    const { body } = await history(`from=${yesterday}&to=${today}&status=cancelled&type=dine_in`);
    // Tokens 10..60 step 10 are cancelled; dine in is index % 3 === 0, so tokens 10, 40 each day.
    expect(body.orders.map((order: Json) => order.dailyToken)).toEqual([40, 10, 40, 10]);
    expect(body.summary.count).toBe(120);
  });

  it('finds a token, a name, a phone typed the local way and a table', async () => {
    expect((await history(`from=${today}&q=7`)).body.orders.map((order: Json) => order.dailyToken)).toEqual([7]);
    expect((await history(`from=${today}&q=ayesha`)).body.orders).toHaveLength(1);
    expect((await history(`from=${today}&q=0300 1234567`)).body.orders).toHaveLength(1);
    const table = await history(`from=${yesterday}&to=${today}&q=t7`);
    expect(table.body.orders).toHaveLength(2);
    expect(table.body.summary.count).toBe(2);
  });

  it('refuses more than a year, bad days and a broken cursor', async () => {
    expect((await history('from=2025-01-01&to=2026-06-01')).status).toBe(400);
    expect((await history('from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await history(`from=${today}&cursor=nope`)).status).toBe(400);
  });

  it('GET /orders?since= answers only what changed from then on', async () => {
    const since = new Date().toISOString();
    await Order.updateOne({ restaurantId, dayKey: today, dailyToken: 3 }, { $set: { status: 'ready' } });
    const res = await app.request(`/api/v1/orders?since=${encodeURIComponent(since)}`, { headers });
    const orders = (await res.json()) as Json[];
    expect(orders.map((order) => order.dailyToken)).toEqual([3]);
    expect((await app.request('/api/v1/orders?since=yesterday', { headers })).status).toBe(400);
  });
});
