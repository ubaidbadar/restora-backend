import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import Invitation from '../src/models/invitation';
import { toObjectId } from '../src/utils/auth_users';

// Sign-in context, onboarding, invitations, roles, teams and owner actions, through the HTTP API.

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
interface Person { cookie: string; userId: string; email: string }

async function signup(email: string, name: string): Promise<Person> {
  const res = await app.request('/api/v1/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'StrongPassword123!' }),
  });
  expect(res.status).toBe(200);
  const data = (await res.json()) as { user: { id: string } };
  return { cookie: res.headers.get('set-cookie') || '', userId: data.user.id, email };
}

const call = (who: { cookie: string }, method: string, path: string, body?: unknown) =>
  app.request(`/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: who.cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const json = async (res: Response) => (await res.json()) as Json;

async function onboard(who: Person, name: string) {
  const res = await call(who, 'POST', '/onboarding', { name, branchName: 'Main' });
  expect(res.status).toBe(201);
  return json(res);
}

/** Makes this person's sign-ins look older than 10 minutes. */
async function ageSessions(who: Person) {
  await mongoose.connection.db!.collection('session').updateMany({ userId: toObjectId(who.userId) }, { $set: { createdAt: new Date(Date.now() - 3_600_000) } });
}

describe('Auth, onboarding and team management', () => {
  let owner: Person;
  let restaurantId: string;
  let mainBranchId: string;
  let secondBranchId: string;

  beforeAll(async () => {
    owner = await signup('team-owner@test.com', 'Owner Omar');
  });

  it('answers 401 signed_out without a sign-in', async () => {
    const res = await app.request('/api/v1/me');
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('signed_out');
  });

  it('has no workplace before onboarding, and refuses restaurant data', async () => {
    const me = await json(await call(owner, 'GET', '/me'));
    expect(me.user.email).toBe('team-owner@test.com');
    expect(me.mode).toBe('web');
    expect(me.workplace).toBeNull();
    expect(me.restaurants).toEqual([]);
    // Empty fields are left out.
    expect('image' in me.user).toBe(false);
    expect('device' in me).toBe(false);
    expect((await call(owner, 'GET', '/customers')).status).toBe(403);
  });

  it('onboarding makes the new restaurant the workplace, with every permission', async () => {
    const data = await onboard(owner, 'Team Grill');
    restaurantId = data.restaurantId;
    mainBranchId = data.branch._id;
    const wp = data.me.workplace;
    expect(wp.restaurant._id).toBe(restaurantId);
    expect(wp.isPrimaryOwner).toBe(true);
    expect(wp.permissions).toContain('roles:manage');
    expect(wp.branch._id).toBe(mainBranchId);
    expect(wp.settings.taxSet).toBe(false);
    expect(data.me.restaurants).toEqual([{ _id: restaurantId, name: 'Team Grill', isOwner: true }]);
    expect('receipt' in wp.settings).toBe(false);
    expect(wp.roleNames).toEqual(['Owner']);
  });

  it('onboarding saves the logo picked during setup, and refuses anything but an image', async () => {
    const other = await signup('logo-owner@test.com', 'Logo Lina');
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    expect((await call(other, 'POST', '/onboarding', { name: 'Logo Cafe', branchName: 'Main', logo: 'javascript:alert(1)' })).status).toBe(400);
    const res = await call(other, 'POST', '/onboarding', { name: 'Logo Cafe', branchName: 'Main', logo: png });
    expect(res.status).toBe(201);
    const data = await json(res);
    expect(data.restaurant.logo).toContain(`r_${data.restaurantId}__logos__`);
    const settings = await json(await call(other, 'GET', '/settings'));
    expect(settings.logo).toBe(data.restaurant.logo);
    // /me shows it on the workplace's restaurant and in the restaurants list.
    const me = await json(await call(other, 'GET', '/me'));
    expect(me.workplace.restaurant.logo).toBe(data.restaurant.logo);
    expect(me.restaurants).toEqual([{ _id: data.restaurantId, name: 'Logo Cafe', logo: data.restaurant.logo, isOwner: true }]);
  });

  it('saving tax finishes that setup step; the answer is the saved settings, which /me then shows', async () => {
    const saved = await json(await call(owner, 'PATCH', '/settings', { taxByPaymentMethod: { cash: 15, card: 5, jazzcash: 5, easypaisa: 5, bank: 5 } }));
    expect(saved.taxSet).toBe(true);
    expect(saved.taxByPaymentMethod.cash).toBe(15);
    expect(saved.me).toBeUndefined();
    const { settings } = (await json(await call(owner, 'GET', '/me'))).workplace;
    expect(settings.taxSet).toBe(true);
    expect(settings.updatedAt).toBe(new Date(settings.updatedAt).toISOString());

    await call(owner, 'PATCH', '/settings', { receipt: { ntn: '1234567-8' } });
    expect((await json(await call(owner, 'GET', '/me'))).workplace.settings.receipt).toEqual({ ntn: '1234567-8' });

    // The theme is the restaurant's: indigo, light and a theme-coloured sidebar until changed, one key at a time.
    expect(settings.appearance).toEqual({ theme: 'indigo', mode: 'light', sidebar: 'theme' });
    await call(owner, 'PATCH', '/settings', { appearance: { theme: 'saffron', mode: 'system' } });
    expect((await json(await call(owner, 'GET', '/me'))).workplace.settings.appearance).toEqual({ theme: 'saffron', mode: 'system', sidebar: 'theme' });
    expect((await call(owner, 'PATCH', '/settings', { appearance: { theme: 'pink' } })).status).toBe(400);
  });

  it('switches branch only to an open branch', async () => {
    const created = await json(await call(owner, 'POST', '/branches', { name: 'Second' }));
    secondBranchId = created._id;
    // The owner works at every branch, so the app adds the new one to the switcher itself.
    const owned = await json(await call(owner, 'GET', '/me'));
    expect(owned.workplace.allBranches).toBe(true);
    expect(owned.workplace.branches.map((b: Json) => b._id)).toContain(secondBranchId);
    const me = await json(await call(owner, 'POST', '/me/branch', { branchId: secondBranchId }));
    expect(me.workplace.branch._id).toBe(secondBranchId);
    expect((await json(await call(owner, 'GET', '/me'))).workplace.branch._id).toBe(secondBranchId);
    expect((await call(owner, 'POST', '/me/branch', { branchId: '000000000000000000000000' })).status).toBe(403);
    await call(owner, 'POST', '/me/branch', { branchId: mainBranchId });
  });

  it('invites by email, and only that email can join', async () => {
    const roles = (await json(await call(owner, 'GET', '/roles'))) as Json[];
    const waiterRole = roles.find((r) => r.key === 'waiter')!;
    const invite = await json(await call(owner, 'POST', '/invitations', { channel: 'email', email: 'Team-Waiter@test.com', roleIds: [waiterRole._id], branchScope: 'list', branchIds: [mainBranchId] }));
    expect(invite.email).toBe('team-waiter@test.com');
    expect(invite.token).toBeUndefined();
    const token = invite.inviteUrl.split('/invite/')[1];

    const lookup = await json(await app.request(`/api/v1/invitations/lookup/${token}`));
    expect(lookup.status).toBe('pending');
    expect(lookup.roleNames).toEqual(['Waiter']);
    expect(lookup.branchNames).toEqual(['Main']);

    const stranger = await signup('team-stranger@test.com', 'Stranger');
    expect((await call(stranger, 'POST', `/invitations/accept/${token}`)).status).toBe(400);

    const waiter = await signup('team-waiter@test.com', 'Waiter Wasim');
    const joined = await json(await call(waiter, 'POST', `/invitations/accept/${token}`));
    expect(joined.me.workplace.restaurant._id).toBe(restaurantId);
    expect(joined.me.workplace.permissions).toContain('orders:create');
    expect(joined.me.workplace.permissions).not.toContain('staff:manage');
    expect(joined.me.workplace.branches.map((b: Json) => b._id)).toEqual([mainBranchId]);
    // The link works once.
    expect((await call(waiter, 'POST', `/invitations/accept/${token}`)).status).toBe(400);
    // A waiter cannot switch to a branch they don't work at.
    expect((await call(waiter, 'POST', '/me/branch', { branchId: secondBranchId })).status).toBe(403);
    // Inviting them again is refused: they already work here.
    expect((await call(owner, 'POST', '/invitations', { channel: 'email', email: 'team-waiter@test.com', roleIds: [waiterRole._id], branchScope: 'all' })).status).toBe(409);
  });

  it('resends (new link, old one dead), replaces a repeat invite, and cancels', async () => {
    const roles = (await json(await call(owner, 'GET', '/roles'))) as Json[];
    const cashier = roles.find((r) => r.key === 'cashier')!;
    const first = await json(await call(owner, 'POST', '/invitations', { channel: 'email', email: 'team-cash@test.com', roleIds: [cashier._id], branchScope: 'all' }));
    const second = await json(await call(owner, 'POST', '/invitations', { channel: 'email', email: 'team-cash@test.com', roleIds: [cashier._id], branchScope: 'all' }));
    expect((await Invitation.findById(first._id))!.status).toBe('revoked');

    const oldToken = second.inviteUrl.split('/invite/')[1];
    const resent = await json(await call(owner, 'POST', `/invitations/${second._id}/resend`));
    const newToken = resent.inviteUrl.split('/invite/')[1];
    expect(newToken).not.toBe(oldToken);
    expect((await app.request(`/api/v1/invitations/lookup/${oldToken}`)).status).toBe(404);

    expect((await call(owner, 'POST', `/invitations/${second._id}/revoke`)).status).toBe(200);
    expect((await call(owner, 'POST', `/invitations/${second._id}/revoke`)).status).toBe(400);
    expect((await json(await app.request(`/api/v1/invitations/lookup/${newToken}`))).status).toBe('revoked');
  });

  it('joins from /restaurants, and switches between restaurants', async () => {
    const other = await signup('team-other-owner@test.com', 'Other Owner');
    const otherRestaurant = await onboard(other, 'Other Place');
    const roles = (await json(await call(other, 'GET', '/roles'))) as Json[];
    await call(other, 'POST', '/invitations', { channel: 'email', email: 'team-owner@test.com', roleIds: [roles.find((r) => r.key === 'manager')!._id], branchScope: 'all' });

    const mine = (await json(await call(owner, 'GET', '/my-invitations'))) as Json[];
    expect(mine.map((i) => i.restaurantName)).toEqual(['Other Place']);
    const joined = await json(await call(owner, 'POST', `/my-invitations/${mine[0]!._id}/accept`));
    expect(joined.me.workplace.restaurant._id).toBe(otherRestaurant.restaurantId);
    expect(joined.me.workplace.isOwner).toBe(false);

    // The restaurants page reads /me: oldest first, and which ones they own.
    expect(joined.me.restaurants).toEqual([
      { _id: restaurantId, name: 'Team Grill', isOwner: true },
      { _id: otherRestaurant.restaurantId, name: 'Other Place' },
    ]);
    // Old app versions still read GET /restaurants.
    const list = (await json(await call(owner, 'GET', '/restaurants'))) as Json[];
    expect(list.map((m) => m.restaurant.name).sort()).toEqual(['Other Place', 'Team Grill']);

    const back = await json(await call(owner, 'POST', '/me/workplace', { restaurantId }));
    expect(back.workplace.restaurant._id).toBe(restaurantId);
    const stranger = await signup('team-nobody@test.com', 'Nobody');
    expect((await call(stranger, 'POST', '/me/workplace', { restaurantId })).status).toBe(403);
  });

  it('roles: unique names, rename, reset a preset, never touch Owner', async () => {
    const roles = (await json(await call(owner, 'GET', '/roles'))) as Json[];
    const ownerRole = roles.find((r) => r.key === 'owner')!;
    const kitchen = roles.find((r) => r.key === 'kitchen')!;

    expect((await call(owner, 'POST', '/roles', { name: 'waiter', permissions: [] })).status).toBe(409);
    const custom = await json(await call(owner, 'POST', '/roles', { name: 'Head waiter', permissions: ['orders:view'] }));
    const renamed = await json(await call(owner, 'PATCH', `/roles/${custom._id}`, { name: 'Captain' }));
    expect(renamed.name).toBe('Captain');
    expect(renamed.permissions).toEqual(['orders:view']);

    const matrix = (await json(await call(owner, 'POST', '/roles/matrix', { p: { [`r${kitchen._id}`]: ['orders:view'] } }))) as Json[];
    expect(matrix.find((r) => r._id === kitchen._id)!.permissions).toEqual(['orders:view']);
    const reset = await json(await call(owner, 'POST', `/roles/${kitchen._id}/reset`));
    expect(reset.permissions).toEqual(['orders:view', 'orders:update', 'menu:view', 'menu:stock']);
    expect((await call(owner, 'POST', `/roles/${ownerRole._id}/reset`)).status).toBe(400);
    expect((await call(owner, 'PATCH', `/roles/${ownerRole._id}`, { name: 'Boss' })).status).toBe(400);
    expect((await call(owner, 'DELETE', `/roles/${custom._id}`)).status).toBe(200);
  });

  it('teams only hold people who work at the team branch', async () => {
    const members = (await json(await call(owner, 'GET', '/members'))) as Json[];
    const waiter = members.find((m) => m.user?.email === 'team-waiter@test.com')!;
    expect((await call(owner, 'POST', '/teams', { name: 'Second shift', branchId: secondBranchId, membershipIds: [waiter._id] })).status).toBe(400);
    expect((await call(owner, 'POST', '/teams', { name: 'Main shift', branchId: mainBranchId, membershipIds: [waiter._id] })).status).toBe(201);
  });

  it('POS: unlock, /me in pos mode, then suspending signs them off at once', async () => {
    const waiterLogin = await app.request('/api/v1/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'team-waiter@test.com', password: 'StrongPassword123!' }),
    });
    const waiter = { cookie: waiterLogin.headers.get('set-cookie') || '' };
    expect((await json(await call(waiter, 'POST', '/me/pin', { pin: '2849' }))).success).toBe(true);
    expect((await json(await call(waiter, 'GET', '/me'))).workplace.hasPin).toBe(true);

    const reg = await call(owner, 'POST', '/devices', { name: 'Counter', idleLockSeconds: 300 });
    expect(reg.status).toBe(201);
    const terminal = { cookie: `pos_device_token=${/pos_device_token=([^;]+)/.exec(reg.headers.get('set-cookie') ?? '')?.[1]}` };

    const locked = await call(terminal, 'GET', '/me');
    expect(locked.status).toBe(401);
    expect((await json(locked)).code).toBe('pos_locked');

    const people = (await json(await call(terminal, 'GET', '/pos/people'))) as Json[];
    const person = people.find((p) => p.name === 'Waiter Wasim')!;
    const unlocked = await json(await call(terminal, 'POST', '/pos/unlock', { membershipId: person.membershipId, pin: '2849' }));
    expect(unlocked.me.mode).toBe('pos');
    expect(unlocked.me.user.name).toBe('Waiter Wasim');

    const me = await json(await call(terminal, 'GET', '/me'));
    expect(me.mode).toBe('pos');
    expect(me.user.name).toBe('Waiter Wasim');
    expect(me.device.name).toBe('Counter');
    expect(me.workplace.branch._id).toBe(mainBranchId);
    // Account settings are not for a shared terminal.
    expect((await call(terminal, 'GET', '/me/sessions')).status).toBe(403);
    expect((await call(terminal, 'GET', '/restaurants')).status).toBe(403);

    const suspended = await json(await call(owner, 'POST', `/members/${person.membershipId}/suspend`));
    // The answer is the row as the Staff list shows it.
    expect(suspended.status).toBe('suspended');
    expect(suspended.user.name).toBe('Waiter Wasim');
    expect((await json(await call(terminal, 'GET', '/orders'))).code).toBe('pos_locked');
    // Their own sign-in loses the restaurant too.
    const lost = await call(waiter, 'GET', '/orders');
    expect(lost.status).toBe(403);
    const lostBody = await json(lost);
    expect(lostBody.code).toBe('context_lost');
    // It carries where they can work now (nowhere), so the app needs no second request.
    expect(lostBody.me.workplace).toBeNull();
    // Their restaurants page shows it as suspended, and it cannot be opened.
    expect(lostBody.me.restaurants).toEqual([{ _id: restaurantId, name: 'Team Grill', status: 'suspended' }]);
    expect((await call(waiter, 'POST', '/me/workplace', { restaurantId })).status).toBe(403);
    await call(owner, 'POST', `/members/${person.membershipId}/activate`);
    expect((await json(await call(waiter, 'GET', '/me'))).restaurants).toEqual([{ _id: restaurantId, name: 'Team Grill' }]);
  });

  it('transfer and delete need a recent sign-in', async () => {
    await ageSessions(owner);
    const res = await call(owner, 'POST', '/restaurant/delete', { confirmName: 'Team Grill' });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('reauth_required');
  });

  it('transfers ownership; stepping down removes owner powers', async () => {
    const fresh = await app.request('/api/v1/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'team-owner@test.com', password: 'StrongPassword123!' }),
    });
    owner.cookie = fresh.headers.get('set-cookie') || '';
    // Signing in answers with /me too: the app needs no second request.
    const signedIn = await json(fresh);
    expect(signedIn.me.user.email).toBe('team-owner@test.com');
    expect(signedIn.me.workplace).not.toBeNull();
    await call(owner, 'POST', '/me/workplace', { restaurantId });

    const members = (await json(await call(owner, 'GET', '/members'))) as Json[];
    const waiter = members.find((m) => m.user?.email === 'team-waiter@test.com')!;
    const res = await call(owner, 'POST', '/restaurant/transfer', { membershipId: waiter._id, confirmName: 'team grill', keepMeAsOwner: false });
    expect(res.status).toBe(200);
    const me = (await json(res)).me;
    expect(me.workplace.isPrimaryOwner).toBe(false);
    expect(me.workplace.isOwner).toBe(false);
    expect(me.workplace.permissions).not.toContain('roles:manage');
    expect((await call(owner, 'POST', '/roles', { name: 'X', permissions: [] })).status).toBe(403);
  });

  it('the new owner deletes; others lose it; the owner can keep it', async () => {
    const login = await app.request('/api/v1/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'team-waiter@test.com', password: 'StrongPassword123!' }),
    });
    const newOwner = { cookie: login.headers.get('set-cookie') || '' };
    await call(newOwner, 'POST', '/me/workplace', { restaurantId });

    const deleted = await call(newOwner, 'POST', '/restaurant/delete', { confirmName: 'Team Grill' });
    expect(deleted.status).toBe(200);
    const afterDelete = (await json(deleted)).me;
    expect(afterDelete.workplace).toBeNull();
    // Its owner still sees it, to keep it.
    const [listed] = afterDelete.restaurants;
    expect(listed).toMatchObject({ _id: restaurantId, name: 'Team Grill', isOwner: true, status: 'deleting' });
    expect(Date.parse(listed.deleteAfter)).toBeGreaterThan(Date.now());
    expect((await call(newOwner, 'POST', '/me/workplace', { restaurantId })).status).toBe(403);

    // The former owner (still a member) is moved off it, and no longer sees it.
    const former = await json(await call(owner, 'GET', '/me'));
    expect(former.workplace?.restaurant._id).not.toBe(restaurantId);
    expect(former.restaurants.map((r: Json) => r._id)).not.toContain(restaurantId);

    expect((await call(owner, 'POST', `/restaurants/${restaurantId}/keep`)).status).toBe(403);
    expect((await call(newOwner, 'POST', `/restaurants/${restaurantId}/keep`)).status).toBe(200);
    const back = await json(await call(newOwner, 'POST', '/me/workplace', { restaurantId }));
    expect(back.workplace.isPrimaryOwner).toBe(true);
  });

  it('leaving moves the sign-in on', async () => {
    await call(owner, 'POST', '/me/workplace', { restaurantId });
    const res = await call(owner, 'POST', '/restaurant/leave');
    expect(res.status).toBe(200);
    const me = (await json(res)).me;
    expect(me.workplace.restaurant.name).toBe('Other Place');
  });

  it('account deletion: prevents owner of active restaurant, and allows deletion otherwise', async () => {
    // A fresh owner with an active restaurant cannot delete account
    const freshOwner = await signup('fresh-owner@test.com', 'Fresh Owner');
    await onboard(freshOwner, 'Fresh Restaurant');
    const deleteOwnerRes = await call(freshOwner, 'DELETE', '/me');
    expect(deleteOwnerRes.status).toBe(400);
    const err = await json(deleteOwnerRes);
    expect(err.message).toContain('Transfer ownership or delete the restaurant first');

    // Create a standalone user with no restaurants
    const solo = await signup('solo-user@test.com', 'Solo User');
    const soloMe = await call(solo, 'GET', '/me');
    expect(soloMe.status).toBe(200);

    // Delete account succeeds
    const deleteRes = await call(solo, 'DELETE', '/me');
    expect(deleteRes.status).toBe(200);

    // After deletion, session no longer works
    const afterRes = await call(solo, 'GET', '/me');
    expect(afterRes.status).toBe(401);
  });
});
