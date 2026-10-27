import { Hono } from 'hono';
import printJobController from '../controllers/print_job';
import { requireMember } from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { printJobCreateSchema } from '../validations/print_agent';

const printJobRouter = new Hono();

printJobRouter.post('/', requireMember, validateBody(printJobCreateSchema), printJobController.create);

export default printJobRouter;
