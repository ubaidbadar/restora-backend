import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';

// Change streams need a replica set, so this file runs on its own one-node set.
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

async function signupAndOnboard(email: string, name: string) {
  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: `${name} Grill`, branchName: 'Main', city: 'Karachi' }),
  });
  const headers = { 'Content-Type': 'application/json', Cookie: cookie };

  const category = (await (await app.request('/api/v1/menu/categories', { method: 'POST', headers, body: JSON.stringify({ name: 'BBQ' }) })).json()) as any;
  const item = (await (
    await app.request('/api/v1/menu/items', {
      method: 'POST',
      headers,
      body: JSON.stringify({ categoryId: category._id, name: 'Seekh Kabab', sizes: [{ name: 'Plate', price: 700 }] }),
    })
  ).json()) as any;

  const placeOrder = async () =>
    (await (
      await app.request('/api/v1/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ type: 'takeaway', paymentStatus: 'unpaid', items: [{ itemId: item._id, qty: 1, addonIds: [] }] }),
      })
    ).json()) as any;
  return { headers, placeOrder };
}

/** Reads SSE events off a response until `count` have arrived. */
async function readEvents(res: Response, count: number) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: any }[] = [];
  let buffer = '';
  while (events.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value);
    const blocks = buffer.split('\n\n');
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = block.match(/^event: (.*)$/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (event && data) events.push({ event, data: JSON.parse(data) });
    }
  }
  await reader.cancel();
  return events;
}

describe('Live orders stream', () => {
  it('needs a sign-in', async () => {
    const res = await app.request('/api/v1/orders/stream');
    expect(res.status).toBe(401);
  });

  it("sends the restaurant's new and changed orders, and no other restaurant's", async () => {
    const alpha = await signupAndOnboard('alpha@stream.com', 'Alpha');
    const beta = await signupAndOnboard('beta@stream.com', 'Beta');

    const res = await app.request('/api/v1/orders/stream', { headers: alpha.headers });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = readEvents(res, 2);
    // Let the change stream open before writing.
    await Bun.sleep(300);

    await beta.placeOrder();
    const order = await alpha.placeOrder();
    await app.request(`/api/v1/orders/${order._id}/status`, { method: 'PATCH', headers: alpha.headers, body: JSON.stringify({ status: 'preparing' }) });

    const [created, updated] = await events;
    expect(created!.event).toBe('order.created');
    expect(created!.data._id).toBe(order._id);
    expect(created!.data.dailyToken).toBe(order.dailyToken);
    expect(updated!.event).toBe('order.updated');
    expect(updated!.data._id).toBe(order._id);
    expect(updated!.data.status).toBe('preparing');
  });
});
