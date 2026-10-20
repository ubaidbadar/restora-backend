import { Hono } from 'hono';
import teamController from '../controllers/team';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import teamSchema, { teamUpdateSchema } from '../validations/team';

const teamRouter = new Hono();

teamRouter.get('/', requirePermission('teams:manage'), teamController.list);
teamRouter.post('/', requirePermission('teams:manage'), validateBody(teamSchema), teamController.create);
teamRouter.patch('/:id', requirePermission('teams:manage'), validateBody(teamUpdateSchema), teamController.update);
teamRouter.delete('/:id', requirePermission('teams:manage'), teamController.delete);

export default teamRouter;
