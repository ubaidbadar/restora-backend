import type { Context } from 'hono';
import Team from '../models/team';
import logAudit from '../utils/audit';
import Branch from '../models/branch';
import StaffMember from '../models/staff_member';
import httpError from '../utils/http_error';

/** A team's branch and members must be this restaurant's, and with a branch, everyone must work there. */
async function checkTeam(body: { branchId?: string | null; membershipIds?: string[] }) {
  if (body.branchId && !(await Branch.exists({ _id: body.branchId, isActive: { $ne: false } }).catch(() => null))) {
    throw httpError(400, 'That branch is not open in this restaurant');
  }
  if (body.membershipIds?.length) {
    body.membershipIds = [...new Set(body.membershipIds)];
    const members = await StaffMember.find({ _id: { $in: body.membershipIds } }).catch(() => []);
    if (members.length !== body.membershipIds.length) throw httpError(400, 'One of the people is not in this restaurant');
    const branchId = body.branchId;
    const outside = branchId
      ? members.find((m) => !(m.isOwner || m.isPrimaryOwner || m.branchScope === 'all' || m.branchIds.includes(branchId)))
      : undefined;
    if (outside) throw httpError(400, 'Everyone in the team must work at its branch');
  }
}

export async function listTeams(c: Context) {
  const branchId = c.req.query('branchId');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = { archivedAt: { $exists: false } };
  if (branchId) filter.branchId = branchId;

  const teams = await Team.find(filter).sort({ createdAt: 1 });
  return c.json(teams);
}

export async function createTeam(c: Context) {
  const body = c.get('validatedJson');
  await checkTeam(body);
  const team = await Team.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'team.created',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'team', id: String(team._id), label: team.name },
  });

  return c.json(team, 201);
}

export async function updateTeam(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');
  await checkTeam(body);

  const team = await Team.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!team) {
    return c.json({ message: 'Team not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'team.updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'team', id, label: team.name },
  });

  return c.json(team);
}

export async function deleteTeam(c: Context) {
  const id = c.req.param('id') ?? '';
  const team = await Team.findById(id);
  if (!team) {
    return c.json({ message: 'Team not found' }, 404);
  }

  team.archivedAt = new Date().toISOString();
  await team.save();

  const user = c.get('user');
  await logAudit({
    action: 'team.archived',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'team', id, label: team.name },
  });

  return c.json(team);
}

export default {
  list: listTeams,
  create: createTeam,
  update: updateTeam,
  delete: deleteTeam,
};
