import { Hono } from 'hono';
import linkController from '../controllers/print_agent_link';
import printAgentGuard from '../middlewares/print_agent_guard';
import validateBody from '../validations/validator';
import { agentPairSchema, printersReportSchema, printJobResultSchema } from '../validations/print_agent';

const linkRouter = new Hono();

// Pairing is the one call with no token yet: the code is the credential. The rest need the agent's token.
linkRouter.post('/pair', validateBody(agentPairSchema), linkController.pair);

linkRouter.use('*', printAgentGuard);
linkRouter.put('/printers', validateBody(printersReportSchema), linkController.printers);
linkRouter.get('/printers', linkController.currentPrinters);
linkRouter.get('/jobs', linkController.jobs);
linkRouter.post('/jobs/:id', validateBody(printJobResultSchema), linkController.result);

export default linkRouter;
