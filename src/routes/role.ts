import { Hono } from 'hono';
import roleController from '../controllers/role';
import requirePermission, { requireMember } from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import roleSchema, { roleUpdateSchema } from '../validations/role';
import roleMatrixSchema from '../validations/role_matrix';

const roleRouter = new Hono();

roleRouter.get('/', requireMember, roleController.list);
roleRouter.post('/', requirePermission('roles:manage'), validateBody(roleSchema), roleController.create);
roleRouter.patch('/:id', requirePermission('roles:manage'), validateBody(roleUpdateSchema), roleController.update);
roleRouter.delete('/:id', requirePermission('roles:manage'), roleController.delete);
roleRouter.post('/:id/reset', requirePermission('roles:manage'), roleController.reset);
roleRouter.post('/matrix', requirePermission('roles:manage'), validateBody(roleMatrixSchema), roleController.matrix);

export default roleRouter;
