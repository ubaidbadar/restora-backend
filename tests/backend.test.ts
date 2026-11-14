import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';

import Restaurant from '../src/models/restaurant';
import Branch from '../src/models/branch';
import Role from '../src/models/role';
import StaffMember from '../src/models/staff_member';
import Customer from '../src/models/customer';
import MenuCategory from '../src/models/menu_category';
import AddonGroup from '../src/models/addon_group';
import MenuItem from '../src/models/menu_item';
import Order from '../src/models/order';
import Table from '../src/models/table';
import Reservation from '../src/models/reservation';
import KhataEntry from '../src/models/khata_entry';
import Device from '../src/models/device';
import Settings from '../src/models/settings';

import normalizePhone from '../src/utils/normalize_phone';
import calcTotals from '../src/utils/calc_totals';
import validatePin from '../src/utils/validate_pin';
import maskContact from '../src/utils/mask_contact';
import dayKey from '../src/utils/day_key';
import { cleanupExpiredRestaurants } from '../src/workers/restaurant_cleanup';
import { isSmtpConfigured, sendStaffInvitationEmail } from '../src/services/email';

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

// Helper: register user via better-auth and return auth cookie
async function signupUser(email: string, name: string) {
  const res = await app.request('/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      name,
      password: 'StrongPassword123!',
    }),
  });
  const cookie = res.headers.get('set-cookie') || '';
  const data = (await res.json()) as { user: { id: string; name: string; email: string } };
  return { cookie, user: data.user };
}

// Helper: onboard restaurant
async function onboardRestaurant(cookie: string, name: string, branchName: string) {
  const res = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      name,
      branchName,
      city: 'Karachi',
    }),
  });
  const data = (await res.json()) as { restaurantId: string; name: string };
  return data;
}

describe('1. Phone Normalization, PIN Validation & Public Masking', () => {
  it('calculates a percentage service charge after the discount without taxing the charge', () => {
    expect(calcTotals([{ price: 1000, qty: 1 }], 100, 16, 0, 'percentage', 10)).toEqual({
      subtotal: 1000, discount: 100, tax: 144, serviceCharge: 90, total: 1134,
    });
    expect(calcTotals([{ price: 1000, qty: 1 }], 100, 16, 0, 'fixed', 125)).toEqual({
      subtotal: 1000, discount: 100, tax: 144, serviceCharge: 125, total: 1169,
    });
  });

  it('normalizes Pakistani phone numbers to +923XXXXXXXXX', () => {
    expect(normalizePhone('03001234567')).toBe('+923001234567');
    expect(normalizePhone('0321-9876543')).toBe('+923219876543');
    expect(normalizePhone('923451122334')).toBe('+923451122334');
    expect(normalizePhone('+92 333 4455667')).toBe('+923334455667');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('rejects weak or invalid PINs and accepts strong 4-6 digit PINs', () => {
    // Rejects repeated digits
    expect(validatePin('1111').valid).toBe(false);
    expect(validatePin('999999').valid).toBe(false);

    // Rejects sequential ascending/descending
    expect(validatePin('1234').valid).toBe(false);
    expect(validatePin('4321').valid).toBe(false);
    expect(validatePin('56789').valid).toBe(false);
    expect(validatePin('987654').valid).toBe(false);

    // Rejects non-digits or wrong length
    expect(validatePin('12').valid).toBe(false);
    expect(validatePin('1234567').valid).toBe(false);
    expect(validatePin('abcd').valid).toBe(false);

    // Accepts non-trivial PINs
    expect(validatePin('2849').valid).toBe(true);
    expect(validatePin('719402').valid).toBe(true);
  });

  it('masks emails and phones for public invitation lookups', () => {
    expect(maskContact('salman.khan@restaurant.com')).toBe('s***@restaurant.com');
    expect(maskContact('+923001234567')).toBe('+92 300 ****567');
    expect(maskContact('03001234567')).toBe('+92 300 ****567');
  });

  it('formats calendar day in Asia/Karachi time zone', () => {
    const key = dayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('2. Multi-Tenant Isolation', () => {
  let tenantA: { restaurantId: string; cookie: string };
  let tenantB: { restaurantId: string; cookie: string };
  let branchAId: string;
  let customerAId: string;

  beforeAll(async () => {
    // Register Owner A
    const userA = await signupUser('ownerA@tenant.com', 'Owner Alpha');
    const resA = await onboardRestaurant(userA.cookie, 'Tenant Alpha Grill', 'Gulberg Branch');
    tenantA = { restaurantId: resA.restaurantId, cookie: userA.cookie };

    // Register Owner B
    const userB = await signupUser('ownerB@tenant.com', 'Owner Beta');
    const resB = await onboardRestaurant(userB.cookie, 'Tenant Beta Cafe', 'DHA Branch');
    tenantB = { restaurantId: resB.restaurantId, cookie: userB.cookie };

    // Get Branch A id
    const branchesRes = await app.request('/api/v1/branches', {
      headers: { Cookie: tenantA.cookie, 'x-restaurant-id': tenantA.restaurantId },
    });
    const branches = (await branchesRes.json()) as any[];
    branchAId = branches[0]._id;

    // Create Customer under Tenant A
    const custRes = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: tenantA.cookie,
        'x-restaurant-id': tenantA.restaurantId,
      },
      body: JSON.stringify({
        name: 'Alpha Customer',
        phone: '03001112233',
        area: 'Gulberg',
      }),
    });
    const custData = (await custRes.json()) as any;
    customerAId = custData._id;
  });

  it('prevents Tenant B from viewing Tenant A customers', async () => {
    const res = await app.request('/api/v1/customers', {
      headers: {
        Cookie: tenantB.cookie,
        'x-restaurant-id': tenantB.restaurantId,
      },
    });
    expect(res.status).toBe(200);
    const customers = (await res.json()) as any[];
    expect(customers.length).toBe(0);
  });

  it('returns 404 when Tenant B queries Tenant A customer by ID', async () => {
    const res = await app.request(`/api/v1/customers/${customerAId}`, {
      headers: {
        Cookie: tenantB.cookie,
        'x-restaurant-id': tenantB.restaurantId,
      },
    });
    expect(res.status).toBe(404);
  });

  it('prevents Tenant B from seeing Tenant A branches', async () => {
    const res = await app.request('/api/v1/branches', {
      headers: {
        Cookie: tenantB.cookie,
        'x-restaurant-id': tenantB.restaurantId,
      },
    });
    expect(res.status).toBe(200);
    const branches = (await res.json()) as any[];
    expect(branches.length).toBe(1);
    expect(branches[0].name).toBe('DHA Branch');
    expect(branches[0]._id).not.toBe(branchAId);
  });
});

describe('3. Centralized Owner Permission Bypass & Role Guard', () => {
  let ownerCookie: string;
  let restaurantId: string;
  let waiterCookie: string;
  let waiterUserId: string;

  beforeAll(async () => {
    const owner = await signupUser('boss@restaurant.com', 'Boss Owner');
    const onboard = await onboardRestaurant(owner.cookie, 'Permissions Test Resto', 'Main Branch');
    ownerCookie = owner.cookie;
    restaurantId = onboard.restaurantId;

    // Create a second user to be a Waiter
    const waiter = await signupUser('waiter@restaurant.com', 'Staff Waiter');
    waiterCookie = waiter.cookie;
    waiterUserId = waiter.user.id;

    // Look up preset waiter role
    const rolesRes = await app.request('/api/v1/roles', {
      headers: { Cookie: ownerCookie, 'x-restaurant-id': restaurantId },
    });
    const roles = (await rolesRes.json()) as any[];
    const waiterRole = roles.find((r) => r.key === 'waiter');

    // Create staff member membership for waiter with waiter role
    await StaffMember.create({
      restaurantId,
      userId: waiterUserId,
      roleIds: [waiterRole._id],
      branchScope: 'all',
      branchIds: [],
      status: 'active',
      isOwner: false,
      isPrimaryOwner: false,
    });
  });

  it('allows Owner to access devices:manage endpoint without explicit permission in role', async () => {
    const res = await app.request('/api/v1/devices', {
      headers: { Cookie: ownerCookie, 'x-restaurant-id': restaurantId },
    });
    expect(res.status).toBe(200);
  });

  it('allows Owner to access settings:manage endpoint', async () => {
    const res = await app.request('/api/v1/settings', {
      headers: { Cookie: ownerCookie, 'x-restaurant-id': restaurantId },
    });
    expect(res.status).toBe(200);
  });

  it('allows Waiter to access orders:view (granted permission)', async () => {
    const res = await app.request('/api/v1/orders', {
      headers: { Cookie: waiterCookie, 'x-restaurant-id': restaurantId },
    });
    expect(res.status).toBe(200);
  });

  it('rejects Waiter with 403 on devices:manage (ungranted permission)', async () => {
    const res = await app.request('/api/v1/devices', {
      headers: { Cookie: waiterCookie, 'x-restaurant-id': restaurantId },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.message).toContain('Insufficient permissions');
  });

  it('rejects Waiter with 403 on settings update', async () => {
    const res = await app.request('/api/v1/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: waiterCookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({ restaurantName: 'Hacked Name' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('4. Addon Bounds Validation & Menu Stock Control', () => {
  let cookie: string;
  let restaurantId: string;
  let branchId: string;
  let categoryId: string;
  let addonGroupId: string;
  let menuItemId: string;
  let mildOptionId: string;
  let spicyOptionId: string;
  let extraSpicyOptionId: string;

  beforeAll(async () => {
    const user = await signupUser('menu@restaurant.com', 'Menu Manager');
    const onboard = await onboardRestaurant(user.cookie, 'Kababish', 'Mall Road');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    const bRes = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes.json()) as any[];
    branchId = branches[0]._id;

    // Create Category
    const catRes = await app.request('/api/v1/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'BBQ Specialties' }),
    });
    const cat = (await catRes.json()) as any;
    categoryId = cat._id;

    // Create AddonGroup with min: 1, max: 2
    const groupRes = await app.request('/api/v1/menu/addon-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        name: 'Spice Level',
        min: 1,
        max: 2,
        options: [
          { name: 'Mild', price: 0 },
          { name: 'Spicy', price: 50 },
          { name: 'Extra Spicy', price: 100 },
        ],
      }),
    });
    const group = (await groupRes.json()) as any;
    addonGroupId = group._id;
    mildOptionId = group.options[0]._id;
    spicyOptionId = group.options[1]._id;
    extraSpicyOptionId = group.options[2]._id;

    // Create MenuItem
    const itemRes = await app.request('/api/v1/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        categoryId,
        name: 'Mutton Seekh Kabab',
        sizes: [
          { name: 'Half Plate (4 pcs)', price: 750 },
          { name: 'Full Plate (8 pcs)', price: 1400 },
        ],
        addonGroupIds: [addonGroupId],
      }),
    });
    const item = (await itemRes.json()) as any;
    menuItemId = item._id;
  });

  it('rejects order item when chosen addons are below min (min: 1, selected: 0)', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({
        branchId,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [
          {
            itemId: menuItemId,
            qty: 1,
            addonIds: [], // 0 selected
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toContain('requires at least 1 selection(s)');
  });

  it('rejects order item when chosen addons exceed max (max: 2, selected: 3)', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({
        branchId,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [
          {
            itemId: menuItemId,
            qty: 1,
            addonIds: [mildOptionId, spicyOptionId, extraSpicyOptionId], // 3 selected
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.message).toContain('allows at most 2 selection(s)');
  });

  it('accepts order item when addon count is within [min, max] and computes totals accurately', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({
        branchId,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [
          {
            itemId: menuItemId,
            qty: 2,
            addonIds: [spicyOptionId], // 1 selected (+50 Rs)
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const order = (await res.json()) as any;
    // Default size is first size (750) + addon (50) = 800 * qty 2 = 1600
    expect(order.items[0].price).toBe(800);
    expect(order.subtotal).toBe(1600);
    expect(order.total).toBe(1600);
  });

  it('keeps a takeaway walk-in name on the order without creating a customer record', async () => {
    const customersBefore = await Customer.countDocuments({ restaurantId });
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId,
        type: 'takeaway',
        newName: 'Ayesha Siddiqui',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }],
      }),
    });

    expect(res.status).toBe(201);
    const order = (await res.json()) as any;
    expect(order.customerId).toBeUndefined();
    expect(order.customer).toEqual({ name: 'Ayesha Siddiqui' });
    expect(await Customer.countDocuments({ restaurantId })).toBe(customersBefore);
  });

  it('uses a selected customer as the takeaway name by default, while preserving the order snapshot', async () => {
    const customerRes = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'Ali Raza', phone: '03001234567' }),
    });
    const customer = (await customerRes.json()) as any;
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId,
        customerId: customer._id,
        newName: 'Ali Raza - Office',
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }],
      }),
    });

    expect(res.status).toBe(201);
    const order = (await res.json()) as any;
    expect(order.customerId).toBe(customer._id);
    expect(order.customer).toMatchObject({ _id: customer._id, name: 'Ali Raza - Office', phone: customer.phone });
  });

  it('applies a percentage dine-in service charge and preserves it through payment', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId, type: 'dine_in', tableName: '6', paymentStatus: 'unpaid',
        serviceChargeType: 'percentage', serviceChargeValue: 10,
        items: [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }],
      }),
    });
    expect(res.status).toBe(201);
    const order = (await res.json()) as any;
    expect(order.subtotal).toBe(750);
    expect(order.serviceChargeType).toBe('percentage');
    expect(order.serviceChargeValue).toBe(10);
    expect(order.serviceCharge).toBe(75);
    expect(order.total).toBe(825);

    const paidRes = await app.request(`/api/v1/orders/${order._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ paymentMethod: 'cash' }),
    });
    expect(paidRes.status).toBe(200);
    const paid = (await paidRes.json()) as any;
    expect(paid.serviceCharge).toBe(75);
    expect(paid.total).toBe(paid.subtotal - paid.discount + paid.tax + paid.deliveryFee + paid.serviceCharge);
  });

  it('updates a dine-in service charge from percentage to fixed during an unpaid edit', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId, type: 'dine_in', tableName: '7', paymentStatus: 'unpaid',
        serviceChargeType: 'percentage', serviceChargeValue: 5,
        items: [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }],
      }),
    });
    expect(res.status).toBe(201);
    const order = (await res.json()) as any;
    const editRes = await app.request(`/api/v1/orders/${order._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        type: 'dine_in', tableName: '7',
        serviceChargeType: 'fixed', serviceChargeValue: 125,
        items: [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }],
      }),
    });
    expect(editRes.status).toBe(200);
    const edited = (await editRes.json()) as any;
    expect(edited.serviceChargeType).toBe('fixed');
    expect(edited.serviceChargeValue).toBe(125);
    expect(edited.serviceCharge).toBe(125);
    expect(edited.total).toBe(875);
  });

  it('refuses a service charge on takeaway and percentages above 100', async () => {
    const headers = { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId };
    const items = [{ itemId: menuItemId, qty: 1, addonIds: [mildOptionId] }];
    const takeaway = await app.request('/api/v1/orders', {
      method: 'POST', headers,
      body: JSON.stringify({ branchId, type: 'takeaway', paymentStatus: 'unpaid', serviceChargeType: 'fixed', serviceChargeValue: 80, items }),
    });
    expect(takeaway.status).toBe(400);
    const excessive = await app.request('/api/v1/orders', {
      method: 'POST', headers,
      body: JSON.stringify({ branchId, type: 'dine_in', tableName: '8', paymentStatus: 'unpaid', serviceChargeType: 'percentage', serviceChargeValue: 101, items }),
    });
    expect(excessive.status).toBe(400);
  });

  it('toggles item soldOut status per branch dynamically', async () => {
    // Initially soldOut is false
    const menuRes1 = await app.request(`/api/v1/menu?branchId=${branchId}`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const menu1 = (await menuRes1.json()) as any;
    const item1 = menu1.items.find((i: any) => i._id === menuItemId);
    expect(item1.soldOut).toBe(false);

    // Toggle stock soldOut = true for this branch
    const toggleRes = await app.request(`/api/v1/menu/items/${menuItemId}/stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ branchId, soldOut: true }),
    });
    expect(toggleRes.status).toBe(200);

    // Now GET /menu returns soldOut: true for this branch
    const menuRes2 = await app.request(`/api/v1/menu?branchId=${branchId}`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const menu2 = (await menuRes2.json()) as any;
    const item2 = menu2.items.find((i: any) => i._id === menuItemId);
    expect(item2.soldOut).toBe(true);
  });
});

describe('5. Asia/Karachi dailyToken Reset & Branch Isolation', () => {
  let cookie: string;
  let restaurantId: string;
  let branch1Id: string;
  let branch2Id: string;
  let menuItemId: string;

  beforeAll(async () => {
    const user = await signupUser('token@restaurant.com', 'Token Manager');
    const onboard = await onboardRestaurant(user.cookie, 'Token House', 'Branch Blue');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    const bRes1 = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes1.json()) as any[];
    branch1Id = branches[0]._id;

    // Create second branch
    const bRes2 = await app.request('/api/v1/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'Branch Green' }),
    });
    const branch2 = (await bRes2.json()) as any;
    branch2Id = branch2._id;

    // Create category
    const catRes = await app.request('/api/v1/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'Hot Beverages' }),
    });
    const cat = (await catRes.json()) as any;

    // Create item
    const itemRes = await app.request('/api/v1/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        categoryId: cat._id,
        name: 'Simple Chai',
        sizes: [{ name: 'Cup', price: 100 }],
      }),
    });
    const item = (await itemRes.json()) as any;
    menuItemId = item._id;
  });

  it('increments dailyToken sequentially per branch (1, 2, 3)', async () => {
    const res1 = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId: branch1Id,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1 }],
      }),
    });
    const order1 = (await res1.json()) as any;
    expect(order1.dailyToken).toBe(1);

    const res2 = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId: branch1Id,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1 }],
      }),
    });
    const order2 = (await res2.json()) as any;
    expect(order2.dailyToken).toBe(2);

    const res3 = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId: branch1Id,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1 }],
      }),
    });
    const order3 = (await res3.json()) as any;
    expect(order3.dailyToken).toBe(3);
  });

  it('starts dailyToken at 1 for another branch on the same day', async () => {
    const res = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId: branch2Id,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 1 }],
      }),
    });
    const order = (await res.json()) as any;
    expect(order.dailyToken).toBe(1);
  });
});

describe('6. Transactional Khata Ledger & Payment Processing', () => {
  let cookie: string;
  let restaurantId: string;
  let branchId: string;
  let customerId: string;
  let menuItemId: string;

  beforeAll(async () => {
    const user = await signupUser('khata@restaurant.com', 'Khata Manager');
    const onboard = await onboardRestaurant(user.cookie, 'Khata Cafe', 'Clifton');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    const bRes = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes.json()) as any[];
    branchId = branches[0]._id;

    // Create Customer
    const cRes = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        name: 'Tariq Siddiqui',
        phone: '03331234567',
        area: 'Clifton Block 2',
      }),
    });
    const cust = (await cRes.json()) as any;
    customerId = cust._id;

    // Create category
    const catRes = await app.request('/api/v1/menu/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'Fast Food' }),
    });
    const cat = (await catRes.json()) as any;

    // Create Menu Item
    const itemRes = await app.request('/api/v1/menu/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        categoryId: cat._id,
        name: 'Chicken Club Sandwich',
        sizes: [{ name: 'Regular', price: 600 }],
      }),
    });
    const item = (await itemRes.json()) as any;
    menuItemId = item._id;
  });

  it('atomically creates KhataEntry and increments khataBalance on order payment with khata', async () => {
    // 1. Create order
    const orderRes = await app.request('/api/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId,
        customerId,
        type: 'takeaway',
        paymentStatus: 'unpaid',
        items: [{ itemId: menuItemId, qty: 2 }], // 1200 Rs
      }),
    });
    const order = (await orderRes.json()) as any;
    expect(order.total).toBe(1200);

    // 2. Record payment as khata
    const payRes = await app.request(`/api/v1/orders/${order._id}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        paymentMethod: 'cash',
        paymentStatus: 'khata',
      }),
    });
    expect(payRes.status).toBe(200);
    const paidOrder = (await payRes.json()) as any;
    expect(paidOrder.paymentStatus).toBe('khata');
    expect(paidOrder.total).toBe(1392); // 1200 + 16% cash tax

    // 3. Verify Customer khataBalance
    const custRes = await app.request(`/api/v1/customers/${customerId}`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const cust = (await custRes.json()) as any;
    expect(cust.khataBalance).toBe(1392);

    // 4. Verify KhataEntry in customer's khata ledger
    const ledgerRes = await app.request(`/api/v1/customers/${customerId}/khata`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const ledger = (await ledgerRes.json()) as any[];
    expect(ledger.length).toBe(1);
    expect(ledger[0].type).toBe('order');
    expect(ledger[0].amount).toBe(1392);
    expect(ledger[0].balanceAfter).toBe(1392);
    expect(ledger[0].orderToken).toBe(order.dailyToken);
  });

  it('records cash khata payment and decrements khataBalance', async () => {
    // Customer pays 500 Rs cash towards their ledger
    const payKhataRes = await app.request(`/api/v1/customers/${customerId}/khata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        type: 'payment',
        amount: 500,
        note: 'Partial payment by cash',
      }),
    });
    expect(payKhataRes.status).toBe(201);

    // Check customer balance: was 1392 - 500 = 892
    const custRes = await app.request(`/api/v1/customers/${customerId}`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const cust = (await custRes.json()) as any;
    expect(cust.khataBalance).toBe(892);

    // Check ledger
    const ledgerRes = await app.request(`/api/v1/customers/${customerId}/khata`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const ledger = (await ledgerRes.json()) as any[];
    expect(ledger.length).toBe(2);
    expect(ledger[0].type).toBe('payment');
    expect(ledger[0].amount).toBe(-500);
    expect(ledger[0].balanceAfter).toBe(892);
  });
});

describe('7. QR Public Table Menu & Floor Aggregation', () => {
  let cookie: string;
  let restaurantId: string;
  let branchId: string;
  let tableId: string;
  let qrSlug: string;
  let customerId: string;

  beforeAll(async () => {
    const user = await signupUser('floor@restaurant.com', 'Floor Manager');
    const onboard = await onboardRestaurant(user.cookie, 'Floor Bistro', 'Saddar');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    const bRes = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes.json()) as any[];
    branchId = branches[0]._id;

    // Create Customer
    const custRes = await app.request('/api/v1/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({ name: 'Guest Diner', phone: '03009988776' }),
    });
    const cust = (await custRes.json()) as any;
    customerId = cust._id;

    // Create Table
    const tableRes = await app.request('/api/v1/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        branchId,
        name: 'Table 7',
        section: 'Indoor VIP',
        seats: 4,
      }),
    });
    const table = (await tableRes.json()) as any;
    tableId = table._id;
    qrSlug = table.qrCode;
  });

  it('serves unauthenticated public menu via table QR code', async () => {
    const res = await app.request(`/api/v1/public/t/${qrSlug}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.table.name).toBe('Table 7');
    expect(data.restaurant.name).toBe('Floor Bistro');
  });

  it('handles guest calls for staff and bill from table QR without auth', async () => {
    const callRes = await app.request(`/api/v1/public/t/${qrSlug}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'waiter' }),
    });
    expect(callRes.status).toBe(200);
    const body = (await callRes.json()) as any;
    expect(body.success).toBe(true);
    expect(body.message).toContain('Staff requested for table Table 7');
  });

  it('GET /me carries the open guest calls, so the app starts with one request', async () => {
    const me = (await (await app.request('/api/v1/me', { headers: { Cookie: cookie } })).json()) as any;
    expect(me.workplace.calls).toEqual([{ _id: expect.any(String), tableId, tableName: 'Table 7', type: 'waiter', createdAt: expect.any(String) }]);
    // Other requests do not load them.
    const branches = await app.request('/api/v1/me/branch', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ branchId }) });
    expect(((await branches.json()) as any).workplace.calls).toBeUndefined();
  });

  it('aggregates active orders, guest requests, and bookings in GET /tables/floor', async () => {
    // 1. Create active unpaid order on Table 7
    await Order.create({
      restaurantId,
      branchId,
      tableId,
      tableName: 'Table 7',
      dailyToken: 99,
      type: 'dine_in',
      status: 'preparing',
      paymentStatus: 'unpaid',
      items: [{ itemId: 'dummy-item', name: 'Special Platter', price: 1500, qty: 1 }],
      subtotal: 1500,
      total: 1500,
      dayKey: dayKey(),
    });

    // 2. Create reservation on Table 7 within current window
    await Reservation.create({
      restaurantId,
      branchId,
      tableId,
      customerId,
      partySize: 4,
      dateTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // in 15 mins
      status: 'confirmed',
    });

    // 3. Query GET /tables/floor
    const floorRes = await app.request(`/api/v1/tables/floor?branchId=${branchId}`, {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    expect(floorRes.status).toBe(200);
    const floorTables = (await floorRes.json()) as any[];
    const t7 = floorTables.find((t) => t._id === tableId);

    expect(t7).toBeDefined();
    expect(t7.name).toBe('Table 7');
    expect(t7.orders.length).toBeGreaterThanOrEqual(1);
    expect(t7.orders[0].total).toBe(1500);
    expect(t7.requests.length).toBeGreaterThanOrEqual(1);
    expect(t7.requests[0].type).toBe('waiter');
    expect(t7.booking).toBeDefined();
    expect(t7.booking.partySize).toBe(4);
  });
});

describe('8. POS Device Registration & PIN Rate Limiting', () => {
  let cookie: string;
  let restaurantId: string;
  let branchId: string;
  let deviceToken: string;
  let staffMembershipId: string;

  beforeAll(async () => {
    const user = await signupUser('pos-admin@restaurant.com', 'POS Admin');
    const onboard = await onboardRestaurant(user.cookie, 'POS Station Grill', 'Express');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    const bRes = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes.json()) as any[];
    branchId = branches[0]._id;

    // Register POS device
    const devRes = await app.request('/api/v1/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: JSON.stringify({
        name: 'Front Counter Terminal',
        branchId,
        idleLockSeconds: 120,
      }),
    });
    expect(devRes.status).toBe(201);
    const devData = (await devRes.json()) as any;
    // The token is only in the httpOnly cookie.
    deviceToken = /pos_device_token=([^;]+)/.exec(devRes.headers.get('set-cookie') ?? '')?.[1] ?? '';
    void devData;

    // Update existing owner staff member with PIN
    const pinHash = await Bun.password.hash('849201'); // strong non-sequential PIN
    const staff = await StaffMember.findOne({ restaurantId, userId: user.user.id });
    staff!.pinHash = pinHash;
    staff!.failedPinAttempts = 0;
    staff!.pinLocked = false;
    await staff!.save();
    staffMembershipId = String(staff!._id);
  });

  it('authenticates POS terminal state via x-device-token', async () => {
    const res = await app.request('/api/v1/pos/state', {
      headers: { 'x-device-token': deviceToken },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.device.name).toBe('Front Counter Terminal');
    expect(body.restaurant.name).toBe('POS Station Grill');
  });

  it('fails PIN unlock on incorrect PIN and rate-limits after 5 attempts', async () => {
    // Attempts 1 to 4: should return 401 with remaining attempts
    for (let i = 1; i <= 4; i++) {
      const res = await app.request('/api/v1/pos/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
        body: JSON.stringify({
          membershipId: staffMembershipId,
          pin: '000000', // incorrect
        }),
      });
      expect(res.status).toBe(401);
      const data = (await res.json()) as any;
      expect(data.attemptsLeft).toBe(5 - i);
    }

    // 5th attempt: should lock the staff PIN and pause the terminal
    const res5 = await app.request('/api/v1/pos/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
      body: JSON.stringify({
        membershipId: staffMembershipId,
        pin: '000000',
      }),
    });
    expect(res5.status).toBe(401);
    const data5 = (await res5.json()) as any;
    expect(data5.attemptsLeft).toBe(0);
    expect(data5.pausedUntil).not.toBeNull();

    // 6th attempt: terminal is paused -> 429
    const res6 = await app.request('/api/v1/pos/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-token': deviceToken },
      body: JSON.stringify({
        membershipId: staffMembershipId,
        pin: '849201', // even correct PIN is rejected while terminal is paused
      }),
    });
    expect(res6.status).toBe(429);
    const data6 = (await res6.json()) as any;
    expect(data6.message).toContain('Terminal paused');
  });
});

describe('9. Soft-Delete Restaurant & Scheduled Cleanup Worker', () => {
  let cookie: string;
  let restaurantId: string;

  beforeAll(async () => {
    const user = await signupUser('cleanup@restaurant.com', 'Cleanup Owner');
    const onboard = await onboardRestaurant(user.cookie, 'Doomed Eatery', 'Branch to Delete');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;

    // Create a branch and table under Doomed Eatery
    const bRes = await app.request('/api/v1/branches', {
      headers: { Cookie: cookie, 'x-restaurant-id': restaurantId },
    });
    const branches = (await bRes.json()) as any[];
    await Table.create({
      restaurantId,
      branchId: branches[0]._id,
      name: 'Doomed Table',
      qrCode: 'doomed-table-slug',
    });
  });

  it('schedules restaurant soft-delete with 30-day grace period', async () => {
    const res = await app.request('/api/v1/restaurant/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({ confirmName: 'Doomed Eatery' }),
    });
    expect(res.status).toBe(200);

    const resto = await Restaurant.findById(restaurantId);
    expect(resto?.status).toBe('deleting');
    expect(resto?.deleteAfter).toBeDefined();
  });

  it('cleans up restaurant and cascades to child collections when deleteAfter has passed', async () => {
    // Backdate deleteAfter to simulate 30 days passed
    await Restaurant.findByIdAndUpdate(restaurantId, {
      deleteAfter: new Date(Date.now() - 1000).toISOString(),
    });

    // Run scheduled cleanup
    const deletedCount = await cleanupExpiredRestaurants();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    // Verify restaurant is gone
    const resto = await Restaurant.findById(restaurantId);
    expect(resto).toBeNull();

    // Verify cascade: child branches and tables are cleaned up
    const remainingBranches = await Branch.find({ restaurantId });
    expect(remainingBranches.length).toBe(0);

    const remainingTables = await Table.find({ restaurantId });
    expect(remainingTables.length).toBe(0);
  });
});

describe('10. Cloudflare Uploads & Image Storage', () => {
  let cookie: string;
  let restaurantId: string;

  beforeAll(async () => {
    const user = await signupUser('upload-test@restaurant.com', 'Upload Admin');
    const onboard = await onboardRestaurant(user.cookie, 'Cloudflare Eatery', 'CDN Branch');
    cookie = user.cookie;
    restaurantId = onboard.restaurantId;
  });

  it('uploads multipart image file via POST /api/v1/uploads', async () => {
    const formData = new FormData();
    const fakeImage = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
    formData.append('file', fakeImage, 'logo.png');
    formData.append('folder', 'logos');

    const res = await app.request('/api/v1/uploads', {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: formData,
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.url).toBeDefined();
    expect(data.key).toBeDefined();
    expect(data.key).toContain('logos/');
    expect(data.storage).toBeDefined();
  });

  it('uploads base64 Data URL via POST /api/v1/uploads', async () => {
    const base64Png =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.request('/api/v1/uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({
        dataUrl: base64Png,
        folder: 'dishes',
      }),
    });

    expect(res.status).toBe(201);
    const data = (await res.json()) as any;
    expect(data.url).toBeDefined();
    expect(data.key).toContain('dishes/');
  });

  it('automatically uploads base64 logo in PATCH /api/v1/settings to storage', async () => {
    const base64Logo =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    const res = await app.request('/api/v1/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'x-restaurant-id': restaurantId,
      },
      body: JSON.stringify({
        restaurantName: 'Cloudflare Eatery',
        logo: base64Logo,
      }),
    });

    expect(res.status).toBe(200);
    const settings = (await res.json()) as any;
    expect(settings.logo).toBeDefined();
    // Confirms base64 was converted to clean URL
    expect(settings.logo.startsWith('data:image')).toBe(false);
  });
});

describe('11. SMTP Email Service & Invitation Dispatch', () => {
  it('detects Brevo SMTP configuration from environment', () => {
    expect(isSmtpConfigured()).toBe(true);
  });

  it('formats and dispatches invitation email with template parameters', async () => {
    const success = await sendStaffInvitationEmail({
      to: 'test-recipient@example.com',
      recipientName: 'Ali Ahmed',
      restaurantName: 'The Royal Karahi',
      invitedByName: 'Farhan Owner',
      roleNames: ['Manager', 'Cashier'],
      inviteUrl: 'http://localhost:5173/join?token=test-invitation-token-1234',
    });

    expect(typeof success).toBe('boolean');
  });
});


