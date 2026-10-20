import { Hono } from 'hono';
import customerController from '../controllers/customer';
import khataController from '../controllers/khata';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { customerCreateSchema, customerMergeSchema, customerUpdateSchema } from '../validations/customer';
import customerImportSchema from '../validations/customer_import';
import khataEntryCreateSchema from '../validations/khata';

const customerRouter = new Hono();

customerRouter.get('/', requirePermission('customers:view'), customerController.list);
customerRouter.post('/', requirePermission('customers:manage'), validateBody(customerCreateSchema), customerController.create);
customerRouter.post('/import', requirePermission('customers:import'), validateBody(customerImportSchema), customerController.import);
customerRouter.get('/:id', requirePermission('customers:view'), customerController.get);
customerRouter.patch('/:id', requirePermission('customers:manage'), validateBody(customerUpdateSchema), customerController.update);
customerRouter.delete('/:id', requirePermission('customers:delete'), customerController.delete);
customerRouter.post('/:id/merge', requirePermission('customers:delete'), validateBody(customerMergeSchema), customerController.merge);

// Khata endpoints
customerRouter.get('/:id/khata', requirePermission('customers:view'), khataController.list);
customerRouter.post('/:id/khata', requirePermission('customers:khata'), validateBody(khataEntryCreateSchema), khataController.create);
customerRouter.post('/:id/khata/:entryId/reverse', requirePermission('customers:khata'), khataController.reverse);

export default customerRouter;
