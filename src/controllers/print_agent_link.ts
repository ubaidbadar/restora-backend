import type { Context } from 'hono';
import PrintAgent, { type IPrintAgent } from '../models/print_agent';
import PrintJob from '../models/print_job';
import { runWithoutTenant } from '../middlewares/tenant_context';
import hashToken from '../utils/hash_token';
import httpError from '../utils/http_error';
import mergePrinters from '../utils/merge_printers';
import randomToken from '../utils/random_token';

/** Wrong codes in the last minute, all agents together. Past the limit nobody can try a code until it eases, so 6 digits cannot be guessed. */
let misses: number[] = [];
const MAX_MISSES_PER_MINUTE = 20;

/** The agent types the code it was given; it answers its token, and from then on proves itself with that token. */
export async function pairPrintAgent(c: Context) {
  const { code, version, printers, defaultPrinter } = c.get('validatedJson');
  misses = misses.filter((at) => Date.now() - at < 60_000);
  if (misses.length >= MAX_MISSES_PER_MINUTE) throw httpError(429, 'Too many wrong codes. Wait a minute.');

  const token = randomToken(32);
  const agent = await runWithoutTenant(() =>
    PrintAgent.findOne({ 'pairing.code': code, 'pairing.expiresAt': { $gt: new Date().toISOString() } })
  );
  if (!agent) {
    misses.push(Date.now());
    throw httpError(400, 'That code is wrong or has expired. Get a new one in Settings.');
  }

  agent.tokenLookup = hashToken(token);
  agent.pairing = null;
  agent.version = version;
  agent.lastSeenAt = new Date().toISOString();
  agent.printers = mergePrinters(agent.printers, printers, defaultPrinter);
  await runWithoutTenant(() => agent.save());

  return c.json({ token, agent: { _id: String(agent._id), name: agent.name, branchId: agent.branchId }, printers: agent.printers });
}

/** The printers Windows lists now, sent again when they change. Staff's names and settings are kept. */
export async function reportPrinters(c: Context) {
  const agent = c.get('printAgent') as IPrintAgent & { save: () => Promise<unknown> };
  const { version, printers, defaultPrinter } = c.get('validatedJson');
  agent.printers = mergePrinters(agent.printers, printers);
  if (version) agent.version = version;
  await agent.save();
  // The agent keeps staff's settings, so it can print for the web app on this PC without internet.
  return c.json({ printers: agent.printers });
}

/** Slips waiting for this agent, oldest first. The agent asks every few seconds, which also tells the web app it is online. */
export async function pendingJobs(c: Context) {
  const agent = c.get('printAgent') as IPrintAgent;
  const jobs = await PrintJob.find({ agentId: String(agent._id), status: 'pending' }).sort({ createdAt: 1 }).limit(20);
  // The agent prints a slip once per orderKey, kind and printer. A reprint (no autoKey) gets a key of its own, so it prints every time it is asked for.
  return c.json(jobs.map((job) => ({ _id: String(job._id), printer: job.printer, kind: job.kind, orderKey: job.autoKey ? job.orderKey : `${job.orderKey}~${job._id}`, width: job.width, copies: job.copies, order: job.order, header: job.header })));
}

/** The agent says a slip is printed, or why it could not be (after its own retries). */
export async function jobResult(c: Context) {
  const agent = c.get('printAgent') as IPrintAgent;
  const { status, error } = c.get('validatedJson');
  const job = await PrintJob.findOneAndUpdate(
    { _id: c.req.param('id') ?? '', agentId: String(agent._id), status: 'pending' },
    { $set: { status, error: status === 'failed' ? error : undefined, printedAt: status === 'printed' ? new Date().toISOString() : undefined } }
  ).catch(() => null);
  // Reported twice (a retry after a dropped answer) is fine.
  if (!job && !(await PrintJob.exists({ _id: c.req.param('id') ?? '', agentId: String(agent._id) }).catch(() => null))) throw httpError(404, 'Print job not found');
  return c.json({ success: true });
}

export default { pair: pairPrintAgent, printers: reportPrinters, jobs: pendingJobs, result: jobResult };
