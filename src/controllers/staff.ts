import type { Context } from 'hono';
import StaffMember from '../models/staff_member';
import Invitation from '../models/invitation';
import Role from '../models/role';
import Branch from '../models/branch';
import Restaurant from '../models/restaurant';
import logAudit from '../utils/audit';
import maskContact from '../utils/mask_contact';
import randomToken from '../utils/random_token';
import normalizePhone from '../utils/normalize_phone';
import httpError from '../utils/http_error';
import { findAuthUserByEmail, findAuthUsers } from '../utils/auth_users';
import { moveTo } from '../utils/workplace';
import { checkAccessGrant, isOwnerMember, ownerRoleIds } from '../utils/staff_access';
import { runWithoutTenant } from '../middlewares/tenant_context';
import { sendStaffInvitationEmail } from '../services/email';
import appOrigin from '../utils/app_origin';
import signOffTerminals from '../utils/sign_off_terminals';
import type { IStaffMember } from '../models/staff_member';

/**
 * Loads the member to change and refuses when the change is not allowed:
 * nobody but an owner may change an owner, and only an owner may change their own access.
 */
async function loadManageable(c: Context, id: string) {
  const member = await StaffMember.findById(id).catch(() => null);
  if (!member) throw httpError(404, 'Staff member not found');

  const actor = c.get('membership') as IStaffMember | undefined;
  const actorIsOwner = Boolean(c.get('isOwner'));
  if (!actorIsOwner && isOwnerMember(member, await ownerRoleIds())) {
    throw httpError(403, 'Only an owner can change an owner');
  }
  if (!actorIsOwner && actor && String(actor._id) === String(member._id)) {
    throw httpError(403, 'Ask an owner to change your own access');
  }
  return member;
}

const auditActor = (c: Context) => ({ name: c.get('user')?.name, via: (c.get('via') ?? 'web') as 'web' | 'pos' });

/** A member as the Staff list shows it, with their account's name and email. */
function memberJson(member: InstanceType<typeof StaffMember>, user: { id: string; name: string; email: string; image: string | null } | undefined) {
  return {
    _id: String(member._id),
    userId: member.userId,
    user: user ? { _id: user.id, name: user.name, email: user.email, image: user.image } : null,
    roleIds: member.roleIds,
    branchScope: member.branchScope,
    branchIds: member.branchIds,
    status: member.status,
    joinedAt: member.joinedAt,
    hasPin: Boolean(member.pinHash),
    pinLocked: Boolean(member.pinLocked),
    isOwner: Boolean(member.isOwner),
    isPrimaryOwner: Boolean(member.isPrimaryOwner),
  };
}

/** After a change: the member in the list's shape, so the page replaces that row without loading the list again. */
const answerMember = async (c: Context, member: InstanceType<typeof StaffMember>) =>
  c.json(memberJson(member, (await findAuthUsers([member.userId])).get(member.userId)));

export async function listStaffMembers(c: Context) {
  const staff = await StaffMember.find({}).sort({ joinedAt: 1 });
  const users = await findAuthUsers(staff.map((m) => m.userId));
  return c.json(staff.map((member) => memberJson(member, users.get(member.userId))));
}

export async function updateStaffMember(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson') as { roleIds: string[]; branchScope: 'all' | 'list'; branchIds: string[] };

  const member = await loadManageable(c, id);
  const grantsOwner = await checkAccessGrant(c, body.roleIds, body.branchScope, body.branchIds);

  if (member.isPrimaryOwner && !grantsOwner) {
    return c.json({ message: 'The primary owner keeps the Owner role. Transfer ownership first.' }, 400);
  }

  member.roleIds = [...new Set(body.roleIds)];
  member.branchScope = body.branchScope;
  member.branchIds = body.branchScope === 'list' ? [...new Set(body.branchIds)] : [];
  member.isOwner = member.isPrimaryOwner || grantsOwner;
  await member.save();

  await logAudit({
    action: 'membership.updated',
    actor: auditActor(c),
    target: { type: 'membership', id },
    changes: { after: { roleIds: member.roleIds, branchScope: member.branchScope, branchIds: member.branchIds } },
  });

  return answerMember(c, member);
}

export async function suspendStaffMember(c: Context) {
  const id = c.req.param('id') ?? '';
  const member = await loadManageable(c, id);

  if (member.isPrimaryOwner) {
    return c.json({ message: 'Cannot suspend the primary owner' }, 400);
  }

  member.status = 'suspended';
  await member.save();
  await signOffTerminals(String(member._id));

  await logAudit({ action: 'membership.suspended', actor: auditActor(c), target: { type: 'membership', id } });
  return answerMember(c, member);
}

export async function activateStaffMember(c: Context) {
  const id = c.req.param('id') ?? '';
  const member = await loadManageable(c, id);

  member.status = 'active';
  await member.save();

  await logAudit({ action: 'membership.activated', actor: auditActor(c), target: { type: 'membership', id } });
  return answerMember(c, member);
}

export async function unlockStaffPin(c: Context) {
  const id = c.req.param('id') ?? '';
  const member = await loadManageable(c, id);

  member.pinLocked = false;
  member.failedPinAttempts = 0;
  await member.save();

  await logAudit({ action: 'pin.unlocked', actor: auditActor(c), target: { type: 'membership', id } });
  return answerMember(c, member);
}

export async function clearStaffPin(c: Context) {
  const id = c.req.param('id') ?? '';
  const member = await loadManageable(c, id);

  member.pinHash = undefined;
  member.pinLocked = false;
  member.failedPinAttempts = 0;
  await member.save();
  await signOffTerminals(String(member._id));

  await logAudit({ action: 'pin.cleared', actor: auditActor(c), target: { type: 'membership', id } });
  return answerMember(c, member);
}

export async function removeStaffMember(c: Context) {
  const id = c.req.param('id') ?? '';
  const member = await loadManageable(c, id);

  if (member.isPrimaryOwner) {
    return c.json({ message: 'Cannot remove the primary owner' }, 400);
  }

  await StaffMember.deleteOne({ _id: member._id });
  await signOffTerminals(String(member._id));

  await logAudit({ action: 'membership.removed', actor: auditActor(c), target: { type: 'membership', id } });
  return c.json({ success: true, message: 'Staff member removed' });
}

const INVITE_DAYS = 7;

const inviteUrlFor = (token: string) => `${appOrigin()}/invite/${token}`;

/** Emails the link for an email invitation. Phone invitations are sent by the inviter from their own WhatsApp. */
async function sendInvite(invitation: InstanceType<typeof Invitation>, token: string) {
  if (invitation.channel !== 'email' || !invitation.email) return;
  const [restaurant, roles] = await Promise.all([
    runWithoutTenant(() => Restaurant.findById(invitation.restaurantId)),
    Role.find({ _id: { $in: invitation.roleIds } }),
  ]);
  sendStaffInvitationEmail({
    to: invitation.email,
    recipientName: invitation.name,
    restaurantName: restaurant?.name || 'Restaurant',
    invitedByName: invitation.invitedByName,
    roleNames: roles.map((r) => r.name),
    inviteUrl: inviteUrlFor(token),
  }).catch((err) => console.error('[Staff Controller] Failed to send invite email:', err));
}

/** Invitations of this restaurant: open ones first. Accepted ones are left out (those people are on the staff list). */
export async function listInvitations(c: Context) {
  const invitations = await Invitation.find({ status: { $ne: 'accepted' } }).sort({ createdAt: -1 }).limit(200);
  return c.json(invitations);
}

export async function createInvitation(c: Context) {
  const body = c.get('validatedJson') as {
    channel: 'email' | 'phone';
    email?: string;
    phone?: string;
    name?: string | null;
    roleIds: string[];
    branchScope: 'all' | 'list';
    branchIds: string[];
  };
  const user = c.get('user');
  await checkAccessGrant(c, body.roleIds, body.branchScope, body.branchIds);

  const email = body.channel === 'email' ? body.email!.trim().toLowerCase() : undefined;
  const phone = body.channel === 'phone' ? normalizePhone(body.phone ?? '')! : undefined;

  if (email) {
    const account = await findAuthUserByEmail(email);
    if (account && (await StaffMember.exists({ userId: account.id }))) {
      return c.json({ message: `${email} already works here` }, 409);
    }
  }

  // One open invitation per person: inviting again replaces the old link.
  await Invitation.updateMany({ status: 'pending', ...(email ? { email } : { phone }) }, { $set: { status: 'revoked' } });

  const token = randomToken(32);
  const invitation = await Invitation.create({
    channel: body.channel,
    email,
    phone,
    name: body.name || undefined,
    roleIds: [...new Set(body.roleIds)],
    branchScope: body.branchScope,
    branchIds: body.branchScope === 'list' ? [...new Set(body.branchIds)] : [],
    token,
    status: 'pending',
    expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    invitedByName: user?.name || 'Manager',
  });

  await logAudit({
    action: 'invitation.created',
    actor: auditActor(c),
    target: { type: 'invitation', id: String(invitation._id), label: invitation.email || invitation.phone },
  });
  await sendInvite(invitation, token);

  // The link goes back to the inviter so they can share it (WhatsApp) or copy it. Lists never carry it.
  return c.json({ ...invitation.toJSON(), inviteUrl: inviteUrlFor(token) }, 201);
}

/** A fresh link for an open or expired invitation: the old link stops working, the 7 days start again. */
export async function resendInvitation(c: Context) {
  const id = c.req.param('id') ?? '';
  const token = randomToken(32);
  const invitation = await Invitation.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { token, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString() } },
    { returnDocument: 'after' }
  ).catch(() => null);
  if (!invitation) {
    return c.json({ message: 'Only an open invitation can be sent again' }, 400);
  }

  await logAudit({
    action: 'invitation.resent',
    actor: auditActor(c),
    target: { type: 'invitation', id, label: invitation.email || invitation.phone },
  });
  await sendInvite(invitation, token);

  return c.json({ ...invitation.toJSON(), inviteUrl: inviteUrlFor(token) });
}

export async function revokeInvitation(c: Context) {
  const id = c.req.param('id') ?? '';
  const invitation = await Invitation.findOneAndUpdate(
    { _id: id, status: 'pending' },
    { $set: { status: 'revoked' } },
    { returnDocument: 'after' }
  ).catch(() => null);
  if (!invitation) {
    return c.json({ message: 'Only an open invitation can be cancelled' }, 400);
  }

  await logAudit({
    action: 'invitation.revoked',
    actor: auditActor(c),
    target: { type: 'invitation', id, label: invitation.email || invitation.phone },
  });

  return c.json(invitation);
}

export async function lookupInvitation(c: Context) {
  const token = c.req.param('token');

  const { invitation, restaurant, roles, branches } = await runWithoutTenant(async () => {
    const invitation = await Invitation.findOne({ token });
    if (!invitation) return { invitation: null, restaurant: null, roles: [], branches: [] };
    const [restaurant, roles, branches] = await Promise.all([
      Restaurant.findById(invitation.restaurantId),
      Role.find({ _id: { $in: invitation.roleIds }, restaurantId: invitation.restaurantId }),
      Branch.find({ _id: { $in: invitation.branchIds }, restaurantId: invitation.restaurantId }),
    ]);
    return { invitation, restaurant, roles, branches };
  });

  if (!invitation) {
    return c.json({ message: 'This invitation link is not valid' }, 404);
  }

  const isExpired = Date.now() > Date.parse(invitation.expiresAt);
  const status = isExpired && invitation.status === 'pending' ? 'expired' : invitation.status;

  return c.json({
    status,
    channel: invitation.channel,
    // The link holder is the invitee: the email pre-fills sign-up. Phones are only shown masked.
    email: invitation.channel === 'email' ? invitation.email : undefined,
    contact: maskContact(invitation.email || invitation.phone || '', invitation.channel),
    name: invitation.name,
    restaurant: { name: restaurant?.name || 'Restaurant', logo: restaurant?.logo },
    invitedByName: invitation.invitedByName,
    roleNames: roles.map((r) => r.name),
    branchNames: branches.map((b) => b.name),
    allBranches: invitation.branchScope === 'all',
    expiresAt: invitation.expiresAt,
  });
}

/**
 * Joins the restaurant of an open invitation, found by its link token or (for /restaurants) by id and the person's email.
 * An email invitation can only be used by that email. Joining makes it the restaurant this sign-in works in.
 */
async function join(c: Context, filter: Record<string, unknown>) {
  const user = c.get('user');

  const result = await runWithoutTenant(async () => {
    // Claimed in one write, so the same link cannot be used twice at once.
    const invitation = await Invitation.findOneAndUpdate(
      { ...filter, status: 'pending', expiresAt: { $gt: new Date().toISOString() } },
      { $set: { status: 'accepted' } },
      { returnDocument: 'before' }
    ).catch(() => null);
    if (!invitation) return { error: 'This invitation is no longer valid. Ask for a new one.' };

    if (invitation.channel === 'email' && invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase()) {
      await Invitation.updateOne({ _id: invitation._id }, { $set: { status: 'pending' } });
      return { error: `This invitation is for ${maskContact(invitation.email, 'email')}. Sign in with that email to join.` };
    }

    const restaurant = await Restaurant.findById(invitation.restaurantId);
    if (restaurant?.status !== 'active') {
      await Invitation.updateOne({ _id: invitation._id }, { $set: { status: 'pending' } });
      return { error: 'This restaurant is closed.' };
    }

    const existing = await StaffMember.findOne({ restaurantId: invitation.restaurantId, userId: user.id });
    if (existing?.status === 'suspended') return { error: 'Your access to this restaurant is suspended. Ask the owner.' };
    if (existing) return { invitation, member: existing, joined: false };

    // Only roles and branches that still exist in that restaurant.
    const [roles, branches] = await Promise.all([
      Role.find({ _id: { $in: invitation.roleIds }, restaurantId: invitation.restaurantId }),
      Branch.find({ _id: { $in: invitation.branchIds }, restaurantId: invitation.restaurantId }),
    ]);
    const member = await StaffMember.create({
      restaurantId: invitation.restaurantId,
      userId: user.id,
      roleIds: roles.map((r) => String(r._id)),
      branchScope: invitation.branchScope,
      branchIds: branches.map((b) => String(b._id)),
      status: 'active',
      isOwner: roles.some((r) => r.key === 'owner'),
      isPrimaryOwner: false,
    });
    return { invitation, member, joined: true };
  });

  if ('error' in result) return c.json({ message: result.error }, 400);

  if (result.joined) {
    await logAudit({
      restaurantId: result.invitation.restaurantId,
      action: 'invitation.accepted',
      actor: { name: user.name, via: 'web' },
      target: { type: 'membership', id: String(result.member._id), label: user.name },
    });
  }

  const me = await moveTo(c, result.member);
  return c.json({ success: true, membershipId: String(result.member._id), restaurantId: result.invitation.restaurantId, me });
}

export async function acceptInvitation(c: Context) {
  return join(c, { token: c.req.param('token') });
}

/** Joining from /restaurants, where invitations sent to the person's email are listed. */
export async function acceptMyInvitation(c: Context) {
  return join(c, { _id: c.req.param('id'), email: c.get('user').email.toLowerCase() });
}

export async function listMyInvitations(c: Context) {
  const user = c.get('user');
  if (!user?.email) {
    return c.json([]);
  }

  const list = await runWithoutTenant(async () => {
    const invitations = await Invitation.find({
      email: user.email.toLowerCase(),
      status: 'pending',
      expiresAt: { $gt: new Date().toISOString() },
    });
    return Promise.all(
      invitations.map(async (inv) => {
        const [restaurant, roles] = await Promise.all([
          Restaurant.findById(inv.restaurantId),
          Role.find({ _id: { $in: inv.roleIds }, restaurantId: inv.restaurantId }),
        ]);
        return {
          _id: String(inv._id),
          restaurantName: restaurant?.name || 'Restaurant',
          roleNames: roles.map((r) => r.name),
          invitedByName: inv.invitedByName,
        };
      })
    );
  });

  return c.json(list);
}

export default {
  listStaffMembers,
  updateStaffMember,
  suspendStaffMember,
  activateStaffMember,
  unlockStaffPin,
  clearStaffPin,
  removeStaffMember,
  listInvitations,
  createInvitation,
  resendInvitation,
  revokeInvitation,
  lookupInvitation,
  acceptInvitation,
  acceptMyInvitation,
  listMyInvitations,
};
