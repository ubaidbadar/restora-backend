import { Hono } from 'hono';
import printAgentController from '../controllers/print_agent';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { printAgentCreateSchema, printerUpdateSchema } from '../validations/print_agent';

const printAgentRouter = new Hono();

printAgentRouter.get('/', requirePermission('devices:manage'), printAgentController.list);
printAgentRouter.post('/', requirePermission('devices:manage'), validateBody(printAgentCreateSchema), printAgentController.create);
printAgentRouter.post('/:id/code', requirePermission('devices:manage'), printAgentController.newCode);
printAgentRouter.patch('/:id/printers/:systemName', requirePermission('devices:manage'), validateBody(printerUpdateSchema), printAgentController.updatePrinter);
printAgentRouter.delete('/:id', requirePermission('devices:manage'), printAgentController.delete);

export default printAgentRouter;
