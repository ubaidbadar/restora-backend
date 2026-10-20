import { Hono } from 'hono';
import reservationController from '../controllers/reservation';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import { reservationCreateSchema, reservationUpdateSchema } from '../validations/reservation';

const reservationRouter = new Hono();

reservationRouter.get('/', requirePermission('reservations:view'), reservationController.list);
reservationRouter.post('/', requirePermission('reservations:manage'), validateBody(reservationCreateSchema), reservationController.create);
reservationRouter.get('/:id', requirePermission('reservations:view'), reservationController.get);
reservationRouter.patch('/:id', requirePermission('reservations:manage'), validateBody(reservationUpdateSchema), reservationController.update);
reservationRouter.delete('/:id', requirePermission('reservations:manage'), reservationController.delete);

export default reservationRouter;
