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
import { findAuthUserByEmail, findAuthUsers, toObjectId } from '../utils/auth_users';
import { isOwnerMembership } from '../utils/workplace';
import lookupUser from '../utils/lookup_user';
import lookup from '../utils/lookup';
import { moveTo } from '../utils/workplace';
import { checkAccessGrant } from '../utils/staff_access';
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
  // The member with any Owner role of theirs, in one aggregation.
  const memberId = toObjectId(id);
  const [found] = memberId
    ? await StaffMember.aggregate<IStaffMember & { ownerRoles: unknown[] }>([
        { $match: { _id: memberId } },
        ...lookup({ from: Role, localField: 'roleIds', as: 'ownerRoles', let: { rid: '$restaurantId' }, pipeline: [{ $match: { key: 'owner', $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $project: { _id: 1 } }] }),
      ])
    : [];
  if (!found) throw httpError(404, 'Staff member not found');
  const { ownerRoles, ...fields } = found;
  const member = StaffMember.hydrate(fields);

  const actor = c.get('membership') as IStaffMember | undefined;
  const actorIsOwner = Boolean(c.get('isOwner'));
  if (!actorIsOwner && (isOwnerMembership(member) || ownerRoles.length > 0)) {
    throw httpError(403, 'Only an owner can change an owner');
  }
  if (!actorIsOwner && actor && String(actor._id) === String(member._id)) {
    throw httpError(403, 'Ask an owner to change your own access');
  }
  return member;
}

const auditActor = (c: Context) => ({ name: c.get('user')?.name, via: (c.get('via') ?? 'web') as 'web' | 'pos' });

/** A member as the Staff list shows it, with their account's name and email. */
function memberJson(member: IStaffMember & { _id: unknown }, user: { id: string; name: string; email: string; image: string | null } | null | undefined) {
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

/** The staff of this restaurant with their accounts' names, in one aggregation. */
export async function listStaffMembers(c: Context) {
  const staff = await StaffMember.aggregate<IStaffMember & { _id: unknown; user: Parameters<typeof memberJson>[1] }>([{ $sort: { joinedAt: 1 } }, ...lookupUser()]);
  return c.json(staff.map((member) => memberJson(member, member.user)));
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

/** An invitation's restaurant (name, logo, state), roles and branches, each limited to that restaurant. */
const invitationJoins = () => [
  ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $project: { name: 1, logo: 1, status: 1 } }] }),
  ...lookup({ from: Role, localField: 'roleIds', as: 'roles', let: { rid: '$restaurantId' }, pipeline: [{ $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $project: { name: 1, key: 1 } }] }),
  ...lookup({ from: Branch, localField: 'branchIds', as: 'branches', let: { rid: '$restaurantId' }, pipeline: [{ $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $project: { name: 1 } }] }),
];

/** Emails the link for an email invitation. Phone invitations are sent by the inviter from their own WhatsApp. */
async function sendInvite(invitation: InstanceType<typeof Invitation>, token: string) {
  if (invitation.channel !== 'email' || !invitation.email) return;
  const [found] = await runWithoutTenant(() => Invitation.aggregate<{ restaurant: { name: string }[]; roles: { name: string }[] }>([{ $match: { _id: invitation._id } }, ...invitationJoins()]));
  sendStaffInvitationEmail({
    to: invitation.email,
    recipientName: invitation.name,
    restaurantName: found?.restaurant[0]?.name || 'Restaurant',
    invitedByName: invitation.invitedByName,
    roleNames: found?.roles.map((r) => r.name) ?? [],
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

  const [found] = await runWithoutTenant(() =>
    Invitation.aggregate<InstanceType<typeof Invitation> & { restaurant: { name: string; logo?: string }[]; roles: { name: string }[]; branches: { name: string }[] }>([
      { $match: { token } },
      { $limit: 1 },
      ...invitationJoins(),
    ])
  );
  const invitation = found;
  const restaurant = found?.restaurant[0];
  const roles = found?.roles ?? [];
  const branches = found?.branches ?? [];

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

    // In one aggregation: the restaurant's state, the person's existing membership there, and the invitation's roles
    // and branches that still exist in that restaurant.
    const [joins] = await Invitation.aggregate<{
      restaurant: { status?: string }[];
      roles: { _id: unknown; key?: string }[];
      branches: { _id: unknown }[];
      existing: (IStaffMember & { _id: unknown })[];
    }>([
      { $match: { _id: invitation._id } },
      ...invitationJoins(),
      { $lookup: { from: StaffMember.collection.collectionName, let: { rid: '$restaurantId' }, pipeline: [{ $match: { userId: user.id, $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $limit: 1 }], as: 'existing' } },
    ]);
    if (joins?.restaurant[0]?.status !== 'active') {
      await Invitation.updateOne({ _id: invitation._id }, { $set: { status: 'pending' } });
      return { error: 'This restaurant is closed.' };
    }

    const found = joins.existing[0];
    if (found?.status === 'suspended') return { error: 'Your access to this restaurant is suspended. Ask the owner.' };
    if (found) return { invitation, member: StaffMember.hydrate(found), joined: false };

    const { roles, branches } = joins;
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

  const me = await moveTo(c, String(result.member.restaurantId));
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

  const list = await runWithoutTenant(() =>
    Invitation.aggregate([
      { $match: { email: user.email.toLowerCase(), status: 'pending', expiresAt: { $gt: new Date().toISOString() } } },
      ...invitationJoins(),
      {
        $project: {
          _id: { $toString: '$_id' },
          restaurantName: { $ifNull: [{ $first: '$restaurant.name' }, 'Restaurant'] },
          roleNames: '$roles.name',
          invitedByName: 1,
        },
      },
    ])
  );

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
