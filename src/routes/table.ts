import { Hono } from 'hono';
import tableController from '../controllers/table';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import tableSchema, { tableUpdateSchema } from '../validations/table';
import tableBatchSchema from '../validations/table_batch';

const tableRouter = new Hono();

tableRouter.get('/', requirePermission('tables:view'), tableController.list);
tableRouter.get('/floor', requirePermission('tables:view'), tableController.getFloor);
tableRouter.post('/', requirePermission('tables:manage'), validateBody(tableSchema), tableController.create);
tableRouter.post('/batch', requirePermission('tables:manage'), validateBody(tableBatchSchema), tableController.batchCreate);
tableRouter.patch('/:id', requirePermission('tables:manage'), validateBody(tableUpdateSchema), tableController.update);
tableRouter.post('/:id/qr', requirePermission('tables:manage'), tableController.regenerateQr);
tableRouter.post('/:id/archive', requirePermission('tables:manage'), tableController.delete);
tableRouter.post('/:id/restore', requirePermission('tables:manage'), tableController.restore);
tableRouter.delete('/:id', requirePermission('tables:manage'), tableController.delete);

export default tableRouter;
