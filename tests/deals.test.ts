import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import Table from '../src/models/table';
import onSale from '../src/utils/on_sale';

type Json = any;

let mongod: MongoMemoryServer;
let headers: Record<string, string>;
let branchId: string;
let categoryId: string;
let karahi: Json;
let naan: Json;
let drinks: Json;
let deal: Json;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongod.getUri());

  const signup = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'deals@restaurant.com', name: 'Deal Maker', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboard = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Deal House', branchName: 'Gulberg', city: 'Lahore' }),
  });
  const { restaurantId } = (await onboard.json()) as Json;
  headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
  branchId = ((await (await app.request('/api/v1/branches', { headers })).json()) as Json[])[0]._id;
  categoryId = ((await post('/api/v1/menu/categories', { name: 'Deals' })).body as Json)._id;
  karahi = (await post('/api/v1/menu/items', { categoryId, name: 'Chicken Karahi', sizes: [{ name: 'Half', price: 1400 }, { name: 'Full', price: 2600 }] })).body;
  naan = (await post('/api/v1/menu/items', { categoryId, name: 'Naan', sizes: [{ price: 40 }] })).body;
  drinks = (await post('/api/v1/menu/addon-groups', { name: 'Drink', min: 1, max: 1, options: [{ name: 'Coke', price: 0 }, { name: 'Sprite', price: 0 }] })).body;
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

async function post(path: string, body: unknown, method = 'POST') {
  const res = await app.request(path, { method, headers, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as Json };
}

const order = (items: unknown[]) => post('/api/v1/orders', { branchId, type: 'takeaway', paymentStatus: 'unpaid', items });

describe('Deals', () => {
  it('creates a deal from dishes, with a choice and a price of its own', async () => {
    const res = await post('/api/v1/menu/items', {
      categoryId,
      name: 'Deal 1',
      sizes: [{ price: 1999 }],
      addonGroupIds: [drinks._id],
      includes: [
        { itemId: karahi._id, sizeId: karahi.sizes[0]._id, qty: 1 },
        { itemId: naan._id, qty: 2 },
      ],
    });
    expect(res.status).toBe(201);
    deal = res.body;
    expect(deal.includes).toEqual([
      { itemId: karahi._id, sizeId: karahi.sizes[0]._id, qty: 1 },
      { itemId: naan._id, qty: 2 },
    ]);
    expect(deal.days).toEqual([]);
    expect(deal.from).toBe('');
  });

  it('refuses a deal with a missing dish, a wrong size, a deal inside or itself', async () => {
    const missing = await post('/api/v1/menu/items', { categoryId, name: 'Bad', sizes: [{ price: 1 }], includes: [{ itemId: new mongoose.Types.ObjectId().toString(), qty: 1 }] });
    expect(missing.status).toBe(400);
    const wrongSize = await post('/api/v1/menu/items', { categoryId, name: 'Bad', sizes: [{ price: 1 }], includes: [{ itemId: karahi._id, sizeId: naan.sizes[0]._id, qty: 1 }] });
    expect(wrongSize.body.message).toContain('Pick a size of "Chicken Karahi"');
    const nested = await post('/api/v1/menu/items', { categoryId, name: 'Bad', sizes: [{ price: 1 }], includes: [{ itemId: deal._id, qty: 1 }] });
    expect(nested.body.message).toContain('is a deal itself');
    const itself = await post(`/api/v1/menu/items/${deal._id}`, { includes: [{ itemId: deal._id, qty: 1 }] }, 'PATCH');
    expect(itself.body.message).toBe('A deal cannot hold itself');
    const holder = await post(`/api/v1/menu/items/${naan._id}`, { includes: [{ itemId: karahi._id, qty: 1 }] }, 'PATCH');
    expect(holder.body.message).toContain('This dish is in "Deal 1"');
  });

  it('needs both hours or neither', async () => {
    const one = await post(`/api/v1/menu/items/${deal._id}`, { from: '12:00' }, 'PATCH');
    expect(one.status).toBe(400);
    const bad = await post(`/api/v1/menu/items/${deal._id}`, { from: '25:00', to: '16:00' }, 'PATCH');
    expect(bad.status).toBe(400);
  });

  it('orders a deal at its price, with the choice and what is in it on the line', async () => {
    const missingChoice = await order([{ itemId: deal._id, qty: 1 }]);
    expect(missingChoice.status).toBe(400);

    const res = await order([{ itemId: deal._id, qty: 2, addonIds: [drinks.options[1]._id] }]);
    expect(res.status).toBe(201);
    const line = res.body.items[0];
    expect(line.name).toBe('Deal 1');
    expect(line.price).toBe(1999);
    expect(line.addons).toEqual([{ name: 'Sprite', price: 0 }]);
    expect(line.includes).toEqual([
      { name: 'Chicken Karahi', sizeName: 'Half', qty: 1 },
      { name: 'Naan', qty: 2 },
    ]);
    expect(res.body.subtotal).toBe(3998);
  });

  it('is sold out when a dish in it is', async () => {
    await post(`/api/v1/menu/items/${karahi._id}/stock`, { soldOut: true, branchId }, 'PATCH');
    const res = await order([{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('"Chicken Karahi" in "Deal 1" is sold out in this branch');
    await post(`/api/v1/menu/items/${karahi._id}/stock`, { soldOut: false, branchId }, 'PATCH');
  });

  it('is sold only on its days and hours, but stays on an order being edited', async () => {
    const placed = await order([{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }]);
    expect(placed.status).toBe(201);

    // Hours that are never now: the minute just passed, for one minute.
    const now = new Date(Date.now() + 5 * 3_600_000);
    const hh = (d: Date) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
    const from = hh(new Date(now.getTime() - 120_000));
    const to = hh(new Date(now.getTime() - 60_000));
    const set = await post(`/api/v1/menu/items/${deal._id}`, { from, to }, 'PATCH');
    expect(set.status).toBe(200);
    expect(onSale(set.body)).toBe(false);

    const refused = await order([{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }]);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('"Deal 1" is not on sale right now');

    const edited = await post(`/api/v1/orders/${placed.body._id}`, { type: 'takeaway', items: [{ itemId: deal._id, qty: 3, addonIds: [drinks.options[0]._id] }] }, 'PUT');
    expect(edited.status).toBe(200);
    expect(edited.body.items[0].qty).toBe(3);

    await post(`/api/v1/menu/items/${deal._id}`, { from: '', to: '' }, 'PATCH');
  });

  it('saves category and dish priorities through add/edit payloads and keeps every menu in the same order', async () => {
    const drinksCategory = (await post('/api/v1/menu/categories', { name: 'Drinks', priority: 1 })).body;
    expect(drinksCategory.sortOrder).toBe(0);
    expect(drinksCategory.categories.map((category: Json) => category.name)).toEqual(['Drinks', 'Deals']);

    const tea = (await post('/api/v1/menu/items', {
      categoryId: drinksCategory._id,
      name: 'Tea',
      priority: 1,
      sizes: [{ price: 100 }],
    })).body;
    const coffee = (await post('/api/v1/menu/items', {
      categoryId: drinksCategory._id,
      name: 'Coffee',
      priority: 1,
      sizes: [{ price: 120 }],
    })).body;
    const lassi = (await post('/api/v1/menu/items', {
      categoryId: drinksCategory._id,
      name: 'Lassi',
      priority: 2,
      sizes: [{ price: 150 }],
    })).body;

    expect(tea.sortOrder).toBe(0);
    expect(coffee.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Coffee', 'Tea']);
    expect(lassi.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Coffee', 'Lassi', 'Tea']);

    const movedDish = await post(`/api/v1/menu/items/${coffee._id}`, { priority: 3 }, 'PATCH');
    expect(movedDish.status).toBe(200);
    expect(movedDish.body.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Lassi', 'Tea', 'Coffee']);
    expect(movedDish.body.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.sortOrder)).toEqual([0, 1, 2]);

    const juice = (await post('/api/v1/menu/items', {
      categoryId: drinksCategory._id,
      name: 'Juice',
      priority: 2,
      sizes: [{ price: 180 }],
    })).body;
    expect(juice.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Lassi', 'Juice', 'Tea', 'Coffee']);

    const snacksCategory = (await post('/api/v1/menu/categories', { name: 'Snacks', priority: 2 })).body;
    await post('/api/v1/menu/items', {
      categoryId: snacksCategory._id,
      name: 'Samosa',
      priority: 1,
      sizes: [{ price: 50 }],
    });
    const movedToSnacks = await post(`/api/v1/menu/items/${juice._id}`, { categoryId: snacksCategory._id, priority: 1 }, 'PATCH');
    expect(movedToSnacks.status).toBe(200);
    expect(movedToSnacks.body.items.filter((item: Json) => item.categoryId === snacksCategory._id).map((item: Json) => item.name)).toEqual(['Juice', 'Samosa']);
    expect(movedToSnacks.body.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Lassi', 'Tea', 'Coffee']);

    const movedCategory = await post(`/api/v1/menu/categories/${drinksCategory._id}`, { name: 'Drinks', priority: 3 }, 'PATCH');
    expect(movedCategory.status).toBe(200);
    expect(movedCategory.body.categories.map((category: Json) => category.name)).toEqual(['Snacks', 'Deals', 'Drinks']);
    expect(movedCategory.body.categories.map((category: Json) => category.sortOrder)).toEqual([0, 1, 2]);

    const staffMenu = await app.request('/api/v1/menu', { headers });
    const staffData = (await staffMenu.json()) as Json;
    expect(staffData.categories.map((category: Json) => category.name)).toEqual(['Snacks', 'Deals', 'Drinks']);
    expect(staffData.items.filter((item: Json) => item.categoryId === drinksCategory._id).map((item: Json) => item.name)).toEqual(['Lassi', 'Tea', 'Coffee']);

    await post('/api/v1/tables', { branchId, name: 'Priority Table', section: 'Hall', seats: 2 });
    const table = await Table.findOne({ name: 'Priority Table' });
    const publicMenu = (await (await app.request(`/api/v1/public/t/${table!.qrCode}`)).json()) as Json;
    expect(publicMenu.categories.map((category: Json) => category.name)).toEqual(['Snacks', 'Deals', 'Drinks']);
    expect(publicMenu.items.filter((item: Json) => item.categoryId === snacksCategory._id).map((item: Json) => item.name)).toEqual(['Juice', 'Samosa']);
  });

  it('keeps a dish that is in a deal from being deleted', async () => {
    const res = await app.request(`/api/v1/menu/items/${naan._id}`, { method: 'DELETE', headers });
    expect(res.status).toBe(400);
    expect(((await res.json()) as Json).message).toBe('Take it out of "Deal 1" first');
  });

  it('refuses deals with hidden component dishes in staff, WhatsApp and guest ordering', async () => {
    await post(`/api/v1/menu/items/${naan._id}`, { hidden: true }, 'PATCH');
    const staffOrder = await order([{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }]);
    expect(staffOrder.status).toBe(400);
    expect(staffOrder.body.message).toBe('A dish in "Deal 1" is no longer on the menu');

    await post('/api/v1/tables', { branchId, name: 'Hidden deal table', section: 'Hall', seats: 2 });
    const table = await Table.findOne({ name: 'Hidden deal table' });
    const menu = (await (await app.request(`/api/v1/public/t/${table!.qrCode}`)).json()) as Json;
    expect(menu.items.some((item: Json) => item._id === deal._id)).toBe(false);

    const guestOrder = await app.request(`/api/v1/public/t/${table!.qrCode}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }] }),
    });
    expect(guestOrder.status).toBe(400);
    await post(`/api/v1/menu/items/${naan._id}`, { hidden: false }, 'PATCH');
  });

  it('shows guests what is in a deal and takes their order when every component is visible', async () => {
    await post('/api/v1/tables', { branchId, name: 'T1', section: 'Hall', seats: 4 });
    const table = await Table.findOne({ name: 'T1' });
    const menu = (await (await app.request(`/api/v1/public/t/${table!.qrCode}`)).json()) as Json;
    const shown = menu.items.find((item: Json) => item._id === deal._id);
    expect(shown.includes).toEqual([
      { name: 'Chicken Karahi', sizeName: 'Half', qty: 1 },
      { name: 'Naan', qty: 2 },
    ]);
    expect(shown.onSale).toBe(true);
    expect(shown.soldOut).toBe(false);
    expect(menu.items.some((item: Json) => item._id === naan._id)).toBe(false);
    expect(menu.items.find((item: Json) => item._id === karahi._id).includes).toBeUndefined();

    const res = await app.request(`/api/v1/public/t/${table!.qrCode}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ itemId: deal._id, qty: 1, addonIds: [drinks.options[0]._id] }] }),
    });
    expect(res.status).toBe(201);
  });
});

describe('onSale', () => {
  // Thursday 22 October 2026, 13:30 in Pakistan.
  const at = Date.parse('2026-10-22T08:30:00Z');
  it('checks days and hours in Pakistan time, past midnight too', () => {
    expect(onSale({}, at)).toBe(true);
    expect(onSale({ days: [4], from: '12:00', to: '16:00' }, at)).toBe(true);
    expect(onSale({ days: [5] }, at)).toBe(false);
    expect(onSale({ from: '14:00', to: '16:00' }, at)).toBe(false);
    expect(onSale({ from: '22:00', to: '14:00' }, at)).toBe(true);
    expect(onSale({ from: '22:00', to: '02:00' }, at)).toBe(false);
  });
});
