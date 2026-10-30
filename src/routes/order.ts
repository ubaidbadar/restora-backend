import { Hono } from 'hono';
import orderController from '../controllers/order';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { orderCreateSchema, orderEditSchema, orderUpdateSchema } from '../validations/order';
import orderPaymentSchema from '../validations/order_payment';
import orderStatusSchema from '../validations/order_status';

const orderRouter = new Hono();

orderRouter.get('/', requirePermission('orders:view'), orderController.list);
orderRouter.post('/', requirePermission('orders:create'), validateBody(orderCreateSchema), orderController.create);
orderRouter.get('/history', requirePermission('orders:view'), orderController.history);
orderRouter.get('/stream', requirePermission('orders:view'), orderController.stream);
orderRouter.get('/:id', requirePermission('orders:view'), orderController.get);
orderRouter.patch('/:id/status', requirePermission('orders:update'), validateBody(orderStatusSchema), orderController.updateStatus);
orderRouter.post('/:id/payment', requirePermission('orders:payment'), validateBody(orderPaymentSchema), orderController.recordPayment);
orderRouter.patch('/:id', requirePermission('orders:update'), validateBody(orderUpdateSchema), orderController.update);
orderRouter.put('/:id', requirePermission('orders:update'), validateBody(orderEditSchema), orderController.edit);
orderRouter.post('/:id/cancel', requirePermission('orders:cancel'), orderController.cancel);

export default orderRouter;
