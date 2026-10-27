import type { Context, Next } from 'hono';
import PrintAgent from '../models/print_agent';
import { runWithTenant, runWithoutTenant } from './tenant_context';
import hashToken from '../utils/hash_token';
import { terminalInUse } from '../utils/find_device';

/** Print agent routes: the agent's own token (`Authorization: Bearer`) is the credential. Everything after runs scoped to its restaurant. */
export async function printAgentGuard(c: Context, next: Next) {
  const token = c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const signedOut = () => c.json({ code: 'signed_out', message: 'This print agent is not paired. Pair it again.' }, 401);
  if (!token || token.length < 20 || token.length > 200) return signedOut();

  const agent = await runWithoutTenant(() => PrintAgent.findOne({ tokenLookup: hashToken(token) }));
  if (!agent || !(await terminalInUse(agent))) return signedOut();

  // Seen is how the web app tells online from offline; write it at most every 30 seconds.
  const lastSeen = agent.lastSeenAt ? Date.parse(agent.lastSeenAt) : 0;
  if (Date.now() - lastSeen > 30_000) {
    agent.lastSeenAt = new Date().toISOString();
    await runWithoutTenant(() => agent.save());
  }

  c.set('printAgent', agent);
  return runWithTenant(String(agent.restaurantId), () => next());
}

export default printAgentGuard;
