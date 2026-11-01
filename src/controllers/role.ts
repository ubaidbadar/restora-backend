import type { Context } from 'hono';
import Role from '../models/role';
import StaffMember from '../models/staff_member';
import logAudit from '../utils/audit';
import type Permission from '@shared/permission';
import PRESET_ROLES from '@shared/preset_roles';
import escapeRegex from '../utils/escape_regex';

/** Role names are unique in a restaurant (ignoring case). */
async function nameTaken(name: string, exceptId?: string) {
  return Boolean(
    await Role.exists({ name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i'), ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
  );
}

/** Every role with how many people have it, presets first. */
async function rolesWithCounts() {
  const roles = await Role.find({}).sort({ isPreset: -1, createdAt: 1 });
  const staff = await StaffMember.find({}, { roleIds: 1 });
  const counts = new Map<string, number>();
  for (const member of staff) for (const id of new Set(member.roleIds)) counts.set(id, (counts.get(id) ?? 0) + 1);

  const roleList = roles.map((role) => {
    const roleId = String(role._id);
    const memberCount = counts.get(roleId) ?? 0;
    return {
      _id: roleId,
      name: role.name,
      description: role.description,
      key: role.key,
      isPreset: role.isPreset,
      permissions: role.permissions,
      memberCount,
    };
  });

  return roleList;
}

export async function listRoles(c: Context) {
  return c.json(await rolesWithCounts());
}

export async function createRole(c: Context) {
  const body = c.get('validatedJson');
  if (await nameTaken(body.name)) {
    return c.json({ message: `There is already a role called ${body.name}` }, 409);
  }
  const role = await Role.create({
    name: body.name,
    description: body.description || undefined,
    permissions: [...new Set(body.permissions as Permission[])],
    isPreset: false,
  });

  const user = c.get('user');
  await logAudit({
    action: 'role.created',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'role', id: String(role._id), label: role.name },
  });

  return c.json({ ...role.toJSON(), memberCount: 0 }, 201);
}

export async function updateRole(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson') || (await c.req.json());

  const role = await Role.findById(id).catch(() => null);
  if (!role) {
    return c.json({ message: 'Role not found' }, 404);
  }

  if (role.key === 'owner') {
    return c.json({ message: 'The Owner role always has every permission and cannot be changed' }, 400);
  }
  if (body.name && (await nameTaken(body.name, id))) {
    return c.json({ message: `There is already a role called ${body.name}` }, 409);
  }

  const updated = await Role.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });

  const staff = await StaffMember.find({ roleIds: id });
  const memberCount = staff.length;

  const user = c.get('user');
  await logAudit({
    action: 'role.updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'role', id, label: updated?.name },
  });

  return c.json({ ...updated?.toJSON(), memberCount });
}

export async function deleteRole(c: Context) {
  const id = c.req.param('id') ?? '';
  const role = await Role.findById(id).catch(() => null);
  if (!role) {
    return c.json({ message: 'Role not found' }, 404);
  }

  if (role.isPreset) {
    return c.json({ message: 'Cannot delete a preset system role' }, 400);
  }

  const assignedStaff = await StaffMember.countDocuments({ roleIds: id });
  if (assignedStaff > 0) {
    return c.json({ message: `Cannot delete role: ${assignedStaff} staff member(s) have this role` }, 400);
  }

  await Role.findByIdAndDelete(id);

  const user = c.get('user');
  await logAudit({
    action: 'role.deleted',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'role', id, label: role.name },
  });

  return c.json({ success: true, message: 'Role deleted' });
}

/** Puts a preset role (Manager, Cashier, Waiter, Kitchen) back to Restora's permissions for it. */
export async function resetRole(c: Context) {
  const id = c.req.param('id') ?? '';
  const role = await Role.findById(id).catch(() => null);
  const preset = PRESET_ROLES.find((p) => p.key === role?.key);
  if (!role || !role.isPreset || !preset || role.key === 'owner') {
    return c.json({ message: 'Only the preset roles (not Owner) can be reset' }, 400);
  }

  role.permissions = preset.permissions;
  await role.save();

  const user = c.get('user');
  await logAudit({
    action: 'role.reset',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'role', id, label: role.name },
  });

  const memberCount = await StaffMember.countDocuments({ roleIds: id });
  return c.json({ ...role.toJSON(), memberCount });
}

export async function updateRoleMatrix(c: Context) {
  const body = c.get('validatedJson') || (await c.req.json());
  const { p } = body as { p: Record<string, string[]> };

  const changes = Object.entries(p).map(([field, permissions]) => ({
    roleId: field.startsWith('r') ? field.slice(1) : field,
    permissions: [...new Set(permissions)],
  }));
  // Every role must be one of this restaurant's, and the Owner role is never edited here.
  const roles = await Role.find({ _id: { $in: changes.map((ch) => ch.roleId) } }).catch(() => []);
  const editable = new Set(roles.filter((r) => r.key !== 'owner').map((r) => String(r._id)));
  if (changes.some((ch) => !editable.has(ch.roleId))) {
    return c.json({ message: 'One of the roles cannot be edited' }, 400);
  }

  await Promise.all(changes.map((ch) => Role.updateOne({ _id: ch.roleId }, { $set: { permissions: ch.permissions as Permission[] } })));

  const user = c.get('user');
  await logAudit({
    action: 'role.matrix_updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'role', label: 'Permission matrix updated' },
  });

  // Several roles changed: the answer is the whole list, as GET /roles gives it.
  return c.json(await rolesWithCounts());
}

export default {
  list: listRoles,
  create: createRole,
  update: updateRole,
  delete: deleteRole,
  matrix: updateRoleMatrix,
  reset: resetRole,
};
