import { Hono } from 'hono';
import branchController from '../controllers/branch';
import requirePermission, { requireMember } from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import branchSchema from '../validations/branch';

const branchRouter = new Hono();

branchRouter.get('/', requireMember, branchController.list);
branchRouter.post('/', requirePermission('branches:manage'), validateBody(branchSchema), branchController.create);
branchRouter.get('/:id', requireMember, branchController.get);
branchRouter.patch('/:id', requirePermission('branches:manage'), validateBody(branchSchema.partial()), branchController.update);
branchRouter.delete('/:id', requirePermission('branches:manage'), branchController.delete);
branchRouter.post('/:id/archive', requirePermission('branches:manage'), branchController.delete);
branchRouter.post('/:id/reopen', requirePermission('branches:manage'), branchController.reopen);

export default branchRouter;
