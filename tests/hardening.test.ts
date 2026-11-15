import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import StaffMember from '../src/models/staff_member';
import Customer from '../src/models/customer';
import Order from '../src/models/order';
import { runWithTenant } from '../src/middlewares/tenant_context';

// Regression tests for the review fixes: tenancy, money, permissions and the client's API contract.

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongod.getUri());
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

type Json = Record<string, any>;

async function signup(email: string, name: string, path = '/api/v1/auth/sign-up/email') {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'StrongPassword123!' }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { user: { id: string } };
  return { cookie: res.headers.get('set-cookie') || '', userId: data.user.id };
}

function call(cookie: string, restaurantId: string, method: string, path: string, body?: unknown) {
  return app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function owner(email: string, name: string, restaurant: string) {
  const user = await signup(email, name);
  const res = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: user.cookie },
    body: JSON.stringify({ name: restaurant, branchName: 'Main' }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as Json;
  expect(data.restaurant._id).toBe(data.restaurantId);
  expect(data.branch._id).toBeTruthy();
  return { ...user, restaurantId: data.restaurantId as string, branchId: data.branch._id as string };
}

describe('Hardening', () => {
  let a: Awaited<ReturnType<typeof owner>>;
  let b: Awaited<ReturnType<typeof owner>>;
  let dishId: string;
  let addonGroupId: string;
  let customerId: string;

  const api = (who: typeof a, method: string, path: string, body?: unknown) => call(who.cookie, who.restaurantId, method, path, body);

  beforeAll(async () => {
    a = await owner('hard-a@test.com', 'Asma Owner', 'Hardening A');
    b = await owner('hard-b@test.com', 'Bilal Owner', 'Hardening B');

    const cat = (await (await api(a, 'POST', '/menu/categories', { name: 'Mains' })).json()) as Json;
    const group = (await (await api(a, 'POST', '/menu/addon-groups', { name: 'Raita', min: 0, max: 1, options: [{ name: 'Mint', price: 50 }] })).json()) as Json;
    addonGroupId = group._id;
    const dish = (await (await api(a, 'POST', '/menu/items', { categoryId: cat._id, name: 'Karahi', sizes: [{ price: 1000 }], addonGroupIds: [addonGroupId] })).json()) as Json;
    dishId = dish._id;

    const cust = (await (await api(a, 'POST', '/customers', { name: 'Kamran', phone: '03005550001' })).json()) as Json;
    customerId = cust._id;
  });

  it('the /api/auth alias still reaches Better Auth', async () => {
    await signup('hard-alias@test.com', 'Alias User', '/api/auth/sign-up/email');
  });

  it('ignores a restaurant header: the restaurant comes from the sign-in', async () => {
    const branches = (await (await call(b.cookie, a.restaurantId, 'GET', '/branches')).json()) as Json[];
    expect(branches.map((x) => x._id)).toEqual([b.branchId]);
    expect((await call(b.cookie, a.restaurantId, 'GET', '/restaurants')).status).toBe(200);
  });

  it('does not send CORS headers to foreign origins', async () => {
    const evil = await app.request('/api/v1/branches', { headers: { Origin: 'https://evil.example' } });
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const own = await app.request('/api/v1/branches', { headers: { Origin: 'http://localhost:3000' } });
    expect(own.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('scopes aggregations (dashboard numbers) to the restaurant', async () => {
    const order = await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 2 }], paymentStatus: 'paid', paymentMethod: 'cash' });
    expect(order.status).toBe(201);
    const totalIn = (restaurantId: string) =>
      runWithTenant(restaurantId, () => Order.aggregate([{ $group: { _id: null, n: { $sum: 1 } } }]));
    expect((await totalIn(a.restaurantId))[0]?.n).toBeGreaterThan(0);
    expect(await totalIn(b.restaurantId)).toEqual([]);
  });

  it('charges an order once, even when paid twice', async () => {
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', customerId, items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    const first = await api(a, 'POST', `/orders/${order._id}/payment`, { paymentMethod: 'cash', paymentStatus: 'khata' });
    expect(first.status).toBe(200);
    const paid = (await first.json()) as Json;
    const second = await api(a, 'POST', `/orders/${order._id}/payment`, { paymentMethod: 'cash', paymentStatus: 'khata' });
    expect(second.status).toBe(409);
    const cust = await Customer.findById(customerId).setOptions({});
    expect(cust!.khataBalance).toBe(paid.total);
    expect(cust!.orderCount).toBe(1);
  });

  it('cancelling a khata order takes it off what the customer owes', async () => {
    const before = (await Customer.findById(customerId))!.khataBalance!;
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', customerId, items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'khata', paymentMethod: 'cash' })).json()) as Json;
    expect((await Customer.findById(customerId))!.khataBalance).toBe(before + order.total);
    expect((await api(a, 'POST', `/orders/${order._id}/cancel`)).status).toBe(200);
    expect((await Customer.findById(customerId))!.khataBalance).toBe(before);
    expect((await api(a, 'POST', `/orders/${order._id}/cancel`)).status).toBe(404);
  });

  it('allows direct completion and keeps edits limited to unfinished unpaid orders', async () => {
    const direct = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    const directCompletion = await api(a, 'PATCH', `/orders/${direct._id}`, { status: 'completed' });
    expect(directCompletion.status).toBe(200);
    expect(((await directCompletion.json()) as Json).status).toBe('completed');

    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    expect(order.items[0].sizeId).toBeTruthy();
    const edited = await api(a, 'PUT', `/orders/${order._id}`, { type: 'takeaway', items: [{ itemId: dishId, sizeId: order.items[0].sizeId, addonIds: [], qty: 3 }] });
    expect(edited.status).toBe(200);
    const saved = (await edited.json()) as Json;
    expect(saved.items[0].qty).toBe(3);
    expect(saved.total).toBe(order.items[0].price * 3);
    expect(saved.dailyToken).toBe(order.dailyToken);
    // The normal kitchen progression still works when staff prefer to use it.
    for (const status of ['preparing', 'ready', 'completed']) {
      expect((await api(a, 'PATCH', `/orders/${order._id}`, { status })).status).toBe(200);
    }
    expect((await api(a, 'PUT', `/orders/${order._id}`, { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }] })).status).toBe(400);
  });

  it('does not edit a paid order', async () => {
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'paid', paymentMethod: 'cash' })).json()) as Json;
    expect((await api(a, 'PUT', `/orders/${order._id}`, { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 2 }] })).status).toBe(400);
  });

  it('saves an order sent twice with the same clientId only once (offline sync)', async () => {
    const body = { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid', clientId: 'offline-test-0001', placedAt: new Date(Date.now() - 60_000).toISOString() };
    const first = await api(a, 'POST', '/orders', body);
    expect(first.status).toBe(201);
    const order = (await first.json()) as Json;
    expect(order.clientId).toBe('offline-test-0001');
    const again = await api(a, 'POST', '/orders', body);
    expect(again.status).toBe(200);
    expect(((await again.json()) as Json)._id).toBe(order._id);
  });

  it('saves why, by whom and when an order was cancelled', async () => {
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    expect((await api(a, 'POST', `/orders/${order._id}/cancel`, { reason: 'other' })).status).toBe(400);
    expect((await api(a, 'POST', `/orders/${order._id}/cancel`, { reason: 'lost' })).status).toBe(400);
    const res = await api(a, 'POST', `/orders/${order._id}/cancel`, { reason: 'out_of_stock', note: ' No chicken left ' });
    expect(res.status).toBe(200);
    const cancelled = (await res.json()) as Json;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancellation).toMatchObject({ reason: 'out_of_stock', note: 'No chicken left' });
    expect(cancelled.cancellation.byName).toBeTruthy();
    expect(Number.isNaN(Date.parse(cancelled.cancellation.at))).toBe(false);
    // Cancelled orders stay in the day's list, so the board can show them.
    const list = (await (await api(a, 'GET', '/orders')).json()) as Json[];
    expect(list.find((item) => item._id === order._id)?.cancellation?.reason).toBe('out_of_stock');
  });

  it('counts cancelled orders apart on the dashboard, as their own section', async () => {
    const before = ((await (await api(a, 'GET', '/dashboard')).json()) as Json).stats;
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    expect((await api(a, 'POST', `/orders/${order._id}/cancel`, { reason: 'customer_left' })).status).toBe(200);
    const after = ((await (await api(a, 'GET', '/dashboard')).json()) as Json).stats;
    expect(after.sales).toBe(before.sales);
    expect(after.orderCount).toBe(before.orderCount);
    const row = (stats: Json, type: string) => stats.byType.find((r: Json) => r.type === type);
    expect(row(after, 'cancelled').count).toBe(row(before, 'cancelled').count + 1);
    expect(row(after, 'cancelled').sales).toBe(row(before, 'cancelled').sales + order.total);
    expect(row(after, 'takeaway')).toEqual(row(before, 'takeaway'));
  });

  it('shows the dashboard and orders for a span of days', async () => {
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'paid', paymentMethod: 'cash' })).json()) as Json;
    // Moved to an earlier day, as if placed then.
    await runWithTenant(a.restaurantId, () => Order.updateOne({ _id: order._id }, { $set: { dayKey: '2026-01-15' } }));

    const ids = async (query: string) => ((await (await api(a, 'GET', `/orders${query}`)).json()) as Json[]).map((item) => item._id);
    expect(await ids('')).not.toContain(order._id);
    expect(await ids('?date=2026-01-15')).toContain(order._id);
    expect(await ids('?from=2026-01-10&to=2026-01-20')).toContain(order._id);
    expect(await ids('?from=2026-01-16&to=2026-01-20')).not.toContain(order._id);

    const stats = async (query: string) => ((await (await api(a, 'GET', `/dashboard${query}`)).json()) as Json).stats;
    expect((await stats('?from=2026-01-01&to=2026-01-31')).sales).toBe(order.total);
    expect((await stats('?from=2026-01-01&to=2026-01-31')).orderCount).toBe(1);
    expect((await stats('?date=2026-01-14')).orderCount).toBe(0);

    expect((await api(a, 'GET', '/dashboard?from=2026-01-20&to=2026-01-10')).status).toBe(400);
    expect((await api(a, 'GET', '/orders?from=20-01-2026')).status).toBe(400);
  });

  it('cannot cancel through the status route', async () => {
    const order = (await (await api(a, 'POST', '/orders', { type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' })).json()) as Json;
    expect((await api(a, 'PATCH', `/orders/${order._id}`, { status: 'cancelled' })).status).toBe(400);
    expect((await api(a, 'PATCH', `/orders/${order._id}`, { status: 'preparing' })).status).toBe(200);
  });

  it('does not let a manager make someone an owner', async () => {
    const roles = (await (await api(a, 'GET', '/roles')).json()) as Json[];
    const managerRole = roles.find((r) => r.key === 'manager')!;
    const ownerRole = roles.find((r) => r.key === 'owner')!;
    const waiterRole = roles.find((r) => r.key === 'waiter')!;

    // Give the preset Manager staff:manage for this test.
    await api(a, 'POST', '/roles/matrix', { p: { [`r${managerRole._id}`]: [...managerRole.permissions, 'staff:manage'] } });

    const mgr = await signup('hard-mgr@test.com', 'Manager Mo');
    await StaffMember.create({ restaurantId: a.restaurantId, userId: mgr.userId, roleIds: [managerRole._id], branchScope: 'all', branchIds: [], status: 'active' });
    const waiter = await signup('hard-waiter@test.com', 'Waiter Wali');
    const waiterMember = await StaffMember.create({ restaurantId: a.restaurantId, userId: waiter.userId, roleIds: [waiterRole._id], branchScope: 'all', branchIds: [], status: 'active' });
    const mgrApi = (method: string, path: string, body?: unknown) => call(mgr.cookie, a.restaurantId, method, path, body);

    expect((await mgrApi('PATCH', `/members/${waiterMember._id}`, { roleIds: [ownerRole._id], branchScope: 'all', branchIds: [] })).status).toBe(403);
    expect((await mgrApi('POST', '/invitations', { channel: 'email', email: 'x@y.com', roleIds: [ownerRole._id], branchScope: 'all' })).status).toBe(403);
    // A manager may still change a waiter to a non-owner role, but not the owner.
    expect((await mgrApi('PATCH', `/members/${waiterMember._id}`, { roleIds: [managerRole._id], branchScope: 'all', branchIds: [] })).status).toBe(200);
    const ownerMember = await StaffMember.findOne({ restaurantId: a.restaurantId, isPrimaryOwner: true });
    expect((await mgrApi('POST', `/members/${ownerMember!._id}/suspend`)).status).toBe(403);
    // Roles of another restaurant are refused.
    const bRoles = (await (await api(b, 'GET', '/roles')).json()) as Json[];
    expect((await api(a, 'PATCH', `/members/${waiterMember._id}`, { roleIds: [bRoles[1]!._id], branchScope: 'all', branchIds: [] })).status).toBe(400);
  });

  it('lists staff with their real names and emails', async () => {
    const members = (await (await api(a, 'GET', '/members')).json()) as Json[];
    const me = members.find((m) => m.isPrimaryOwner)!;
    expect(me.user.name).toBe('Asma Owner');
    expect(me.user.email).toBe('hard-a@test.com');
  });

  it('POS lists only people of its own restaurant and branch', async () => {
    const reg = await api(a, 'POST', '/devices', { name: 'Till', branchId: a.branchId });
    const token = /pos_device_token=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1];
    expect(((await reg.json()) as Json).token).toBeUndefined();
    const res = await app.request('/api/v1/pos/people', { headers: { Cookie: `pos_device_token=${token}`, 'x-restaurant-id': b.restaurantId } });
    expect(res.status).toBe(200);
    const people = (await res.json()) as Json[];
    expect(people.some((p) => p.name === 'Bilal Owner')).toBe(false);
    expect(people.some((p) => p.name === 'Asma Owner')).toBe(true);
  });

  it('searches customers with regex characters safely', async () => {
    expect((await api(a, 'GET', '/customers?q=(%5B')).status).toBe(200);
  });

  it('merges a customer saved twice into the one kept', async () => {
    const keep = (await (await api(a, 'POST', '/customers', { name: 'Merge Keep', phone: '03001112233' })).json()) as Json;
    const other = (await (await api(a, 'POST', '/customers', { name: 'Merge Other', phone: '03004445566' })).json()) as Json;
    const res = await api(a, 'POST', `/customers/${keep._id}/merge`, { customerId: other._id });
    expect(res.status).toBe(200);
    const merged = (await res.json()) as Json;
    expect(merged._id).toBe(keep._id);
    expect(merged.altPhone).toBe(other.phone);
    expect((await api(a, 'GET', `/customers/${other._id}`)).status).toBe(404);
    expect((await api(a, 'POST', `/customers/${keep._id}/merge`, { customerId: keep._id })).status).toBe(400);
  });

  it('keeps add-ons and visibility when a dish is only renamed', async () => {
    const res = await api(a, 'PATCH', `/menu/items/${dishId}`, { name: 'Chicken Karahi' });
    const dish = (await res.json()) as Json;
    expect(dish.name).toBe('Chicken Karahi');
    expect(dish.addonGroupIds).toEqual([addonGroupId]);
  });

  it('stock toggle returns the dish for the active branch', async () => {
    const res = await call(a.cookie, a.restaurantId, 'PATCH', `/menu/items/${dishId}/stock`, { soldOut: true });
    const dish = (await res.json()) as Json;
    expect(dish.name).toBe('Chicken Karahi');
    expect(dish.soldOut).toBe(true);
    // A sold-out dish cannot be ordered there.
    const order = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: a.cookie, 'x-restaurant-id': a.restaurantId, 'x-branch-id': a.branchId },
      body: JSON.stringify({ type: 'takeaway', items: [{ itemId: dishId, addonIds: [], qty: 1 }], paymentStatus: 'unpaid' }),
    });
    expect(order.status).toBe(400);
    await call(a.cookie, a.restaurantId, 'PATCH', `/menu/items/${dishId}/stock`, { soldOut: false });
  });

  it("matches the client's table, QR and guest-call requests", async () => {
    const batch = await api(a, 'POST', '/tables/batch', { names: ['T1', 'T2'], section: 'Hall' });
    expect(batch.status).toBe(201);
    const tables = (await batch.json()) as Json[];
    expect(tables.map((t) => t.name)).toEqual(['T1', 'T2']);
    const code = tables[0]!.qrCode;

    const callRes = await app.request(`/api/v1/public/t/${code}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'waiter' }) });
    expect(callRes.status).toBe(200);
    const { requestId } = (await callRes.json()) as Json;
    // A second tap does not add a second call.
    const again = (await (await app.request(`/api/v1/public/t/${code}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'waiter' }) })).json()) as Json;
    expect(again.requestId).toBe(requestId);
    expect((await api(a, 'POST', `/guest-requests/${requestId}/resolve`)).status).toBe(200);

    const optIn = await app.request(`/api/v1/public/t/${code}/opt-in`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Guest Ali', phone: '0300 7778889', consent: true }) });
    expect(optIn.status).toBe(200);

    expect((await api(a, 'POST', `/tables/${tables[1]!._id}/archive`)).status).toBe(200);
    expect(((await (await api(a, 'POST', `/tables/${tables[1]!._id}/restore`)).json()) as Json).archived).toBe(false);
  });

  it("takes a guest's order from the table as pending until staff accept it", async () => {
    const [table] = (await (await api(a, 'POST', '/tables/batch', { names: ['G1'], section: 'Hall' })).json()) as Json[];
    const guest = (body: unknown) =>
      app.request(`/api/v1/public/t/${table!.qrCode}/order`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const items = [{ itemId: dishId, addonIds: [], qty: 2 }];

    const sent = await guest({ items, clientId: 'guest-order-1' });
    expect(sent.status).toBe(201);
    const order = (await sent.json()) as Json;
    expect(order.status).toBe('pending');
    expect(order.total).toBeGreaterThan(0);
    // Sending it again (a retry) is the same order.
    expect(((await (await guest({ items, clientId: 'guest-order-1' })).json()) as Json)._id).toBe(order._id);

    const saved = (await (await api(a, 'GET', `/orders/${order._id}`)).json()) as Json;
    expect(saved.tableId).toBe(table!._id);
    expect(saved.type).toBe('dine_in');
    // Not paid, and not counted, before it is accepted.
    expect((await api(a, 'POST', `/orders/${order._id}/payment`, { paymentMethod: 'cash' })).status).toBe(400);
    expect((await api(a, 'PATCH', `/orders/${order._id}/status`, { status: 'completed' })).status).toBe(409);
    expect((await api(a, 'PATCH', `/orders/${order._id}/status`, { status: 'new' })).status).toBe(200);
    expect((await api(a, 'PATCH', `/orders/${order._id}/status`, { status: 'pending' })).status).toBe(400);

    // At most three wait at once.
    for (let i = 0; i < 3; i++) expect((await guest({ items })).status).toBe(201);
    expect((await guest({ items })).status).toBe(429);
    expect((await guest({ items: [] })).status).toBe(400);
    expect((await app.request('/api/v1/public/t/nope-not-a-code/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })).status).toBe(404);
  });

  it("imports customers in the client's shape", async () => {
    const res = await api(a, 'POST', '/customers/import', {
      customers: [{ name: 'Row One', phone: '03001230001' }, { name: 'Bad', phone: '123' }, { phone: '03001230002' }],
      onExisting: 'skip',
    });
    expect(res.status).toBe(200);
    const answer = (await res.json()) as Json;
    expect(answer.added).toBe(1);
    expect(answer.skipped.map((s: Json) => s.row)).toEqual([2, 3]);
  });

  it('only accepts payment and adjustment khata entries by hand', async () => {
    expect((await api(a, 'POST', `/customers/${customerId}/khata`, { type: 'order', amount: 100 })).status).toBe(400);
    const pay = await api(a, 'POST', `/customers/${customerId}/khata`, { type: 'payment', amount: 100 });
    expect(pay.status).toBe(201);
    expect(((await pay.json()) as Json).customer._id).toBe(customerId);
  });

  it('marks tax as set when the welcome step saves rates', async () => {
    const res = await api(a, 'PATCH', '/settings', { taxByPaymentMethod: { cash: 10 } });
    const settings = (await res.json()) as Json;
    expect(settings.taxSet).toBe(true);
    expect(settings.taxByPaymentMethod.cash).toBe(10);
    expect(settings.taxByPaymentMethod.card).toBe(5); // untouched
  });

  it('refuses SVG and non-image uploads', async () => {
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}`;
    expect((await api(a, 'POST', '/uploads', { dataUrl: svg })).status).toBe(400);
    const html = `data:text/html;base64,${Buffer.from('<script>1</script>').toString('base64')}`;
    expect((await api(a, 'POST', '/uploads', { dataUrl: html })).status).toBe(400);
    expect((await api(a, 'DELETE', `/uploads/${encodeURIComponent(`r_${b.restaurantId}/logos/x.png`)}`)).status).toBe(404);
  });
});
