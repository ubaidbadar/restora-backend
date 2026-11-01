import type { Context } from 'hono';
import Branch from '../models/branch';
import logAudit from '../utils/audit';

export async function listBranches(c: Context) {
  const includeArchived = c.req.query('all') === 'true';
  const filter = includeArchived ? {} : { archivedAt: { $exists: false } };
  const branches = await Branch.find(filter).sort({ createdAt: 1 });
  return c.json(branches);
}

export async function createBranch(c: Context) {
  const body = c.get('validatedJson') || (await c.req.json());
  const branch = await Branch.create(body);

  const user = c.get('user');
  await logAudit({
    action: 'branch.created',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'branch', id: String(branch._id), label: branch.name },
  });

  return c.json(branch, 201);
}

export async function getBranch(c: Context) {
  const id = c.req.param('id') ?? '';
  const branch = await Branch.findById(id);
  if (!branch) {
    return c.json({ message: 'Branch not found' }, 404);
  }
  return c.json(branch);
}

export async function updateBranch(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson') || (await c.req.json());

  const before = await Branch.findById(id);
  if (!before) {
    return c.json({ message: 'Branch not found' }, 404);
  }

  const updated = await Branch.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });

  const user = c.get('user');
  await logAudit({
    action: 'branch.updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'branch', id, label: updated?.name },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    changes: { before: before.toObject() as any, after: updated?.toObject() as any },
  });

  return c.json(updated);
}

export async function deleteBranch(c: Context) {
  const id = c.req.param('id') ?? '';
  const branch = await Branch.findById(id);
  if (!branch) {
    return c.json({ message: 'Branch not found' }, 404);
  }

  const openBranches = await Branch.countDocuments({ isActive: { $ne: false }, archivedAt: { $exists: false } });
  if (branch.isActive !== false && openBranches <= 1) {
    return c.json({ message: 'Keep at least one branch open' }, 400);
  }

  branch.isActive = false;
  branch.archivedAt = new Date().toISOString();
  await branch.save();

  const user = c.get('user');
  await logAudit({
    action: 'branch.archived',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'branch', id, label: branch.name },
  });

  return c.json(branch);
}

export async function reopenBranch(c: Context) {
  const id = c.req.param('id') ?? '';
  const branch = await Branch.findOneAndUpdate(
    { _id: id },
    { $set: { isActive: true }, $unset: { archivedAt: 1 } },
    { returnDocument: 'after' }
  );
  if (!branch) {
    return c.json({ message: 'Branch not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'branch.reopened',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'branch', id, label: branch.name },
  });

  return c.json(branch);
}

export default {
  list: listBranches,
  reopen: reopenBranch,
  create: createBranch,
  get: getBranch,
  update: updateBranch,
  delete: deleteBranch,
};
