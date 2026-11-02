import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import type { Json } from './order_stream_cases';

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let branchId: string;
let categoryId: string;
let item1: any;
let item2: any;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'offline@restaurant.com', name: 'Offline Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Offline Diner', branchName: 'DHA', city: 'Lahore' }),
  });
  const restaurantId = ((await onboard.json()) as Json).restaurantId;
  headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;

  const catRes = await app.request('/api/v1/menu/categories', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Mains' }),
  });
  categoryId = ((await catRes.json()) as Json)._id;

  const item1Res = await app.request('/api/v1/menu/items', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Biryani', sizes: [{ price: 300 }], categoryId }),
  });
  item1 = await item1Res.json();

  const item2Res = await app.request('/api/v1/menu/items', {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Raita', sizes: [{ price: 50 }], categoryId }),
  });
  item2 = await item2Res.json();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Offline order lifecycle & timeline audit', () => {
  it('preserves actor, timestamps, and line changes across offline create, edit, status, and cancel', async () => {
    const clientId = `test-client-${Date.now().toString(36)}`;
    const placedAt = new Date(Date.now() - 3600_000).toISOString();

    // 1. Create order taken offline
    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'takeaway',
        items: [{ itemId: item1._id, qty: 2 }],
        clientId,
        placedAt,
        takenBy: 'Offline Waiter Ali',
      }),
    });
    expect(createRes.status).toBe(201);
    const createdOrder = (await createRes.json()) as Json;
    expect(createdOrder.takenBy).toBe('Offline Waiter Ali');
    expect(createdOrder.clientId).toBe(clientId);

    // 2. Offline edit: change 2 Biryani to 1 Biryani + 2 Raita
    const editedAt = new Date(Date.now() - 2400_000).toISOString();
    const editRes = await app.request(`/api/v1/orders/${createdOrder._id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        type: 'takeaway',
        items: [
          { itemId: item1._id, qty: 1 },
          { itemId: item2._id, qty: 2 },
        ],
        editedBy: 'Offline Cashier Sara',
        editedAt,
      }),
    });
    expect(editRes.status).toBe(200);
    const editedOrder = (await editRes.json()) as Json;
    expect(editedOrder.total).toBe(1 * 300 + 2 * 50);

    // 3. Offline status update
    const updatedAt = new Date(Date.now() - 1200_000).toISOString();
    const statusRes = await app.request(`/api/v1/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'preparing',
        updatedBy: 'Chef Babar',
        updatedAt,
      }),
    });
    expect(statusRes.status).toBe(200);

    // 4. Offline cancel
    const cancelledAt = new Date(Date.now() - 600_000).toISOString();
    const cancelRes = await app.request(`/api/v1/orders/${createdOrder._id}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'wrong_order',
        note: 'Customer ordered wrong dishes',
        cancelledBy: 'Manager Hamza',
        cancelledAt,
      }),
    });
    expect(cancelRes.status).toBe(200);

    // 5. Query timeline by MongoDB _id
    const timelineByIdRes = await app.request(`/api/v1/orders/${createdOrder._id}/timeline`, { headers });
    expect(timelineByIdRes.status).toBe(200);
    const timelineById = (await timelineByIdRes.json()) as Json[];

    // 6. Query timeline by clientId
    const timelineByClientRes = await app.request(`/api/v1/orders/${clientId}/timeline`, { headers });
    expect(timelineByClientRes.status).toBe(200);
    const timelineByClient = (await timelineByClientRes.json()) as Json[];

    // Both should return the exact same 4 events in order
    expect(timelineById).toHaveLength(4);
    expect(timelineByClient).toHaveLength(4);

    const [createdEntry, editedEntry, statusEntry, cancelledEntry] = timelineById;

    // Check created entry
    expect(createdEntry.action).toBe('order.created');
    expect(createdEntry.actor.name).toBe('Offline Waiter Ali');
    expect(createdEntry.at).toBe(placedAt);

    // Check edited entry
    expect(editedEntry.action).toBe('order.edited');
    expect(editedEntry.actor.name).toBe('Offline Cashier Sara');
    expect(editedEntry.at).toBe(editedAt);
    expect(editedEntry.changes.after.lines).toBeDefined();
    expect(editedEntry.changes.after.lines.map((l: Json) => `${l.name} ${l.was}>${l.now}`)).toEqual([
      'Biryani 2>1',
      'Raita 0>2',
    ]);

    // Check status entry
    expect(statusEntry.action).toBe('order.status_updated');
    expect(statusEntry.actor.name).toBe('Chef Babar');
    expect(statusEntry.at).toBe(updatedAt);
    expect(statusEntry.changes.after.status).toBe('preparing');

    // Check cancelled entry
    expect(cancelledEntry.action).toBe('order.cancelled');
    expect(cancelledEntry.actor.name).toBe('Manager Hamza');
    expect(cancelledEntry.at).toBe(cancelledAt);
    expect(cancelledEntry.changes.after.reason).toBe('wrong_order');
    expect(cancelledEntry.changes.after.note).toBe('Customer ordered wrong dishes');
  });
});
