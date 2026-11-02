import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';

type Json = any;

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let branchId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `offline-${Date.now()}@test.com`, name: 'Print Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Offline House', branchName: 'Gulberg', city: 'Lahore' }),
  });
  const { restaurantId } = (await onboard.json()) as Json;
  headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

describe('Offline order timeline & history sync', () => {
  it('preserves actor metadata and timestamps for offline creation, edits, status, and cancel', async () => {
    // Create a category & item
    const catRes = await (
      await app.request('/api/v1/menu/categories', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Burgers' }),
      })
    ).json();
    const itemRes = await (
      await app.request('/api/v1/menu/items', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Zinger Burger', categoryId: catRes._id, price: 500, sizes: [{ name: 'Regular', price: 500 }] }),
      })
    ).json();

    // 1. Create order offline with clientId, placedAt, takenBy
    const clientId = `client-${Date.now()}`;
    const placedAt = new Date(Date.now() - 3600000).toISOString();
    const createRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branchId,
        clientId,
        type: 'takeaway',
        items: [{ itemId: itemRes._id, sizeId: itemRes.sizes[0]._id, qty: 2 }],
        takenBy: 'Offline Waiter',
        placedAt,
      }),
    });
    expect(createRes.status).toBe(201);
    const createdOrder = await createRes.json();
    expect(createdOrder.clientId).toBe(clientId);

    // 2. Query timeline by clientId
    const timelineByClientRes = await app.request(`/api/v1/orders/${clientId}/timeline`, { headers });
    expect(timelineByClientRes.status).toBe(200);
    const clientTimeline = await timelineByClientRes.json();
    expect(clientTimeline.length).toBeGreaterThan(0);
    expect(clientTimeline[0].action).toBe('order.created');
    expect(clientTimeline[0].actor.name).toBe('Offline Waiter');
    expect(new Date(clientTimeline[0].at).getTime()).toBe(new Date(placedAt).getTime());

    // 3. Edit order offline with editedBy and editedAt
    const editedAt = new Date(Date.now() - 1800000).toISOString();
    const editRes = await app.request(`/api/v1/orders/${createdOrder._id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        type: 'takeaway',
        items: [{ itemId: itemRes._id, sizeId: itemRes.sizes[0]._id, qty: 3 }],
        editedBy: 'Kitchen Supervisor',
        editedAt,
      }),
    });
    expect(editRes.status).toBe(200);

    // 4. Update status with updatedBy and updatedAt
    const updatedAt = new Date(Date.now() - 900000).toISOString();
    const statusRes = await app.request(`/api/v1/orders/${createdOrder._id}/status`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        status: 'preparing',
        updatedBy: 'Chef Ali',
        updatedAt,
      }),
    });
    expect(statusRes.status).toBe(200);

    // 5. Cancel order with cancelledBy, cancelledAt
    const cancelledAt = new Date(Date.now() - 300000).toISOString();
    const cancelRes = await app.request(`/api/v1/orders/${createdOrder._id}/cancel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        reason: 'customer_left',
        note: 'Left without waiting',
        cancelledBy: 'Floor Manager',
        cancelledAt,
      }),
    });
    expect(cancelRes.status).toBe(200);

    // 6. Verify timeline has all 4 actions with respective actors and timestamps
    const fullTimelineRes = await app.request(`/api/v1/orders/${createdOrder._id}/timeline`, { headers });
    expect(fullTimelineRes.status).toBe(200);
    const fullTimeline = await fullTimelineRes.json();
    expect(fullTimeline.map((e: any) => e.action)).toEqual([
      'order.created',
      'order.edited',
      'order.status_updated',
      'order.cancelled',
    ]);
    expect(fullTimeline[0].actor.name).toBe('Offline Waiter');
    expect(fullTimeline[1].actor.name).toBe('Kitchen Supervisor');
    expect(fullTimeline[2].actor.name).toBe('Chef Ali');
    expect(fullTimeline[3].actor.name).toBe('Floor Manager');
    expect(new Date(fullTimeline[1].at).getTime()).toBe(new Date(editedAt).getTime());
    expect(new Date(fullTimeline[2].at).getTime()).toBe(new Date(updatedAt).getTime());
    expect(new Date(fullTimeline[3].at).getTime()).toBe(new Date(cancelledAt).getTime());
    expect(fullTimeline[1].changes.after.lines[0]).toMatchObject({ name: 'Zinger Burger', was: 2, now: 3 });
  });
});
