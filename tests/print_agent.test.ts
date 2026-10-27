import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';

type Json = any;

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let branchId: string;
let food: Json;
let drinks: Json;
let karahi: Json;
let coke: Json;
let agent: Json;
let token: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'print@restaurant.com', name: 'Print Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Print House', branchName: 'Gulberg', city: 'Lahore' }),
  });
  const { restaurantId } = (await onboard.json()) as Json;
  headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;
  food = (await post('/api/v1/menu/categories', { name: 'Mains' })).body;
  drinks = (await post('/api/v1/menu/categories', { name: 'Drinks' })).body;
  karahi = (await post('/api/v1/menu/items', { categoryId: food._id, name: 'Chicken Karahi', sizes: [{ price: 1400 }] })).body;
  coke = (await post('/api/v1/menu/items', { categoryId: drinks._id, name: 'Coke', sizes: [{ price: 120 }] })).body;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function post(path: string, body: unknown, method = 'POST', extra: Record<string, string> = {}) {
  const res = await app.request(path, { method, headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Json };
}

const agentGet = async (path: string) => {
  const res = await app.request(`/api/v1/print-agent${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { status: res.status, body: (await res.json()) as Json };
};
const placeOrder = (items: unknown[], extra: Record<string, unknown> = {}) => post('/api/v1/orders', { branchId, type: 'takeaway', paymentStatus: 'unpaid', items, ...extra });

describe('Print agents', () => {
  it('adds a PC with a pairing code, and refuses a stranger', async () => {
    const res = await post('/api/v1/print-agents', { name: 'Counter PC' });
    expect(res.status).toBe(201);
    agent = res.body;
    expect(agent.pairing.code).toMatch(/^\d{6}$/);
    expect(agent.printers).toEqual([]);
    expect(agent.tokenLookup).toBeUndefined();

    const noSignIn = await app.request('/api/v1/print-agents');
    expect(noSignIn.status).toBe(401);
  });

  it('pairs with the code once, and the answer holds the token only then', async () => {
    const wrong = await post('/api/v1/print-agent/pair', { code: '000000', printers: [] }, 'POST', { Cookie: '' });
    expect(wrong.status).toBe(400);

    const paired = await post('/api/v1/print-agent/pair', { code: agent.pairing.code, version: '0.1.0', printers: ['EPSON TM-T20', 'Kitchen Star'] }, 'POST', { Cookie: '' });
    expect(paired.status).toBe(200);
    token = paired.body.token;
    expect(token.length).toBeGreaterThan(30);
    expect(paired.body.agent.name).toBe('Counter PC');
    expect(paired.body.printers.map((p: Json) => p.systemName)).toEqual(['EPSON TM-T20', 'Kitchen Star']);

    const again = await post('/api/v1/print-agent/pair', { code: agent.pairing.code, printers: [] }, 'POST', { Cookie: '' });
    expect(again.status).toBe(400);

    const list = (await (await app.request('/api/v1/print-agents', { headers })).json()) as Json[];
    expect(list[0].pairing).toBeNull();
    expect(list[0].version).toBe('0.1.0');
    expect(list[0].lastSeenAt).toBeTruthy();
    expect(list[0].printers.map((p: Json) => [p.systemName, p.prints, p.present])).toEqual([['EPSON TM-T20', [], true], ['Kitchen Star', [], true]]);
    expect(JSON.stringify(list[0])).not.toContain(token);
  });

  it('labels the printers; a bar printer takes only the drinks', async () => {
    const receipt = await post(`/api/v1/print-agents/${agent._id}/printers/${encodeURIComponent('EPSON TM-T20')}`, { label: 'Counter', prints: ['receipt'], categoryIds: [], width: 48, copies: 1 }, 'PATCH');
    expect(receipt.status).toBe(200);
    const kitchen = await post(`/api/v1/print-agents/${agent._id}/printers/${encodeURIComponent('Kitchen Star')}`, { label: 'Kitchen', prints: ['kitchen'], categoryIds: [food._id], width: 32, copies: 2 }, 'PATCH');
    expect(kitchen.body.printers[1]).toMatchObject({ label: 'Kitchen', categoryIds: [food._id], width: 32, copies: 2 });

    const missing = await post(`/api/v1/print-agents/${agent._id}/printers/Nope`, { label: 'X', prints: [], categoryIds: [], width: 48, copies: 1 }, 'PATCH');
    expect(missing.status).toBe(404);
  });

  it('queues a kitchen slip with only the printer\'s dishes when an order is taken', async () => {
    const res = await placeOrder([{ itemId: karahi._id, qty: 1 }, { itemId: coke._id, qty: 2 }]);
    expect(res.status).toBe(201);

    const jobs = await agentGet('/jobs');
    expect(jobs.status).toBe(200);
    expect(jobs.body).toHaveLength(1);
    const job = jobs.body[0];
    expect(job).toMatchObject({ printer: 'Kitchen Star', kind: 'kitchen', width: 32, copies: 2, orderKey: res.body._id });
    expect(job.order.items.map((item: Json) => item.name)).toEqual(['Chicken Karahi']);
  });

  it('queues nothing twice for an order sent twice, and a drinks-only order makes no kitchen slip', async () => {
    const clientId = 'offline-order-0001';
    const first = await placeOrder([{ itemId: karahi._id, qty: 1 }], { clientId });
    const second = await placeOrder([{ itemId: karahi._id, qty: 1 }], { clientId });
    expect(second.body._id).toBe(first.body._id);
    const jobs = await agentGet('/jobs');
    expect(jobs.body.filter((j: Json) => j.orderKey === clientId)).toHaveLength(1);

    await placeOrder([{ itemId: coke._id, qty: 1 }]);
    expect((await agentGet('/jobs')).body).toHaveLength(2);
  });

  it('reprints a receipt on request, and says when no printer is set up', async () => {
    const order = (await placeOrder([{ itemId: coke._id, qty: 1 }])).body;
    const queued = await post('/api/v1/print-jobs', { orderId: order._id, kind: 'receipt' });
    expect(queued.status).toBe(201);
    const again = await post('/api/v1/print-jobs', { orderId: order._id, kind: 'receipt' });
    expect(again.body.queued).toBe(1);

    const jobs = (await agentGet('/jobs')).body.filter((j: Json) => j.kind === 'receipt');
    expect(jobs).toHaveLength(2);
    expect(jobs[0].header.restaurant).toBe('Print House');

    await post(`/api/v1/print-agents/${agent._id}/printers/${encodeURIComponent('EPSON TM-T20')}`, { label: 'Counter', prints: [], categoryIds: [], width: 48, copies: 1 }, 'PATCH');
    const none = await post('/api/v1/print-jobs', { orderId: order._id, kind: 'receipt' });
    expect(none.status).toBe(409);
  });

  it('marks slips printed or failed, and keeps answering when told twice', async () => {
    const [job, other] = (await agentGet('/jobs')).body;
    const printed = await app.request(`/api/v1/print-agent/jobs/${job._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'printed' }) });
    expect(printed.status).toBe(200);
    const twice = await app.request(`/api/v1/print-agent/jobs/${job._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'printed' }) });
    expect(twice.status).toBe(200);
    await app.request(`/api/v1/print-agent/jobs/${other._id}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status: 'failed', error: 'out of paper' }) });

    const waiting = (await agentGet('/jobs')).body.map((j: Json) => j._id);
    expect(waiting).not.toContain(job._id);
    expect(waiting).not.toContain(other._id);
  });

  it('keeps staff\'s labels when the agent reports its printers again, and marks a missing one', async () => {
    const res = await app.request('/api/v1/print-agent/printers', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ printers: ['Kitchen Star', 'Bar Star'] }) });
    expect(res.status).toBe(200);
    // The answer carries staff's settings for the agent to keep.
    expect(((await res.json()) as Json).printers.map((p: Json) => p.systemName)).toEqual(['Kitchen Star', 'Bar Star', 'EPSON TM-T20']);
    const list = (await (await app.request('/api/v1/print-agents', { headers })).json()) as Json[];
    const byName = Object.fromEntries(list[0].printers.map((p: Json) => [p.systemName, p]));
    expect(byName['Kitchen Star']).toMatchObject({ label: 'Kitchen', present: true });
    expect(byName['Bar Star']).toMatchObject({ label: 'Bar Star', prints: [], present: true });
    expect(byName['EPSON TM-T20'].present).toBe(false);
  });

  it('refuses a wrong token, and stops a removed agent at once', async () => {
    const wrong = await app.request('/api/v1/print-agent/jobs', { headers: { Authorization: 'Bearer ' + 'x'.repeat(43) } });
    expect(wrong.status).toBe(401);

    const removed = await post(`/api/v1/print-agents/${agent._id}`, {}, 'DELETE');
    expect(removed.status).toBe(200);
    expect((await agentGet('/jobs')).status).toBe(401);
  });
});
