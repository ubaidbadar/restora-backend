import type { Context } from 'hono';
import PrintAgent from '../models/print_agent';
import logAudit, { auditActor } from '../utils/audit';
import httpError from '../utils/http_error';
import resolveBranchId from '../utils/resolve_branch';
import newPairing from '../utils/new_pairing';


export async function listPrintAgents(c: Context) {
  return c.json(await PrintAgent.find({}).sort({ createdAt: 1 }));
}

export async function createPrintAgent(c: Context) {
  const { name } = c.get('validatedJson');
  const branchId = await resolveBranchId(c);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const agent = await PrintAgent.create({ name, branchId, pairing: newPairing(), printers: [] });
      await logAudit({ action: 'print_agent.added', actor: auditActor(c), target: { type: 'print_agent', id: String(agent._id), label: agent.name } });
      return c.json(agent, 201);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw httpError(503, 'Could not make a pairing code. Try again.');
}

export async function newPairingCode(c: Context) {
  const id = c.req.param('id') ?? '';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      // Only an agent that has not paired yet; a paired one is removed and added again.
      const agent = await PrintAgent.findOneAndUpdate({ _id: id, lastSeenAt: { $exists: false } }, { $set: { pairing: newPairing() } }, { returnDocument: 'after' }).catch(() => null);
      if (!agent) throw httpError(404, 'Print agent not found, or already paired');
      return c.json(agent);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  }
  throw httpError(503, 'Could not make a pairing code. Try again.');
}

export async function updatePrinter(c: Context) {
  const id = c.req.param('id') ?? '';
  const systemName = decodeURIComponent(c.req.param('systemName') ?? '');
  const body = c.get('validatedJson');

  const agent = await PrintAgent.findOneAndUpdate(
    { _id: id, 'printers.systemName': systemName },
    { $set: { 'printers.$.label': body.label, 'printers.$.prints': body.prints, 'printers.$.categoryIds': body.categoryIds, 'printers.$.width': body.width, 'printers.$.copies': body.copies, 'printers.$.automatic': false } },
    { returnDocument: 'after' }
  ).catch(() => null);
  if (!agent) throw httpError(404, 'Printer not found');

  await logAudit({ action: 'print_agent.printer_updated', actor: auditActor(c), target: { type: 'print_agent', id, label: `${agent.name}: ${body.label}` } });
  return c.json(agent);
}

export async function deletePrintAgent(c: Context) {
  const id = c.req.param('id') ?? '';
  const agent = await PrintAgent.findOneAndDelete({ _id: id }).catch(() => null);
  if (!agent) throw httpError(404, 'Print agent not found');
  await logAudit({ action: 'print_agent.removed', actor: auditActor(c), target: { type: 'print_agent', id, label: agent.name } });
  return c.json({ success: true });
}

export default { list: listPrintAgents, create: createPrintAgent, newCode: newPairingCode, updatePrinter, delete: deletePrintAgent };
