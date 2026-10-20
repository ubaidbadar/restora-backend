import { Hono } from 'hono';
import staffController from '../controllers/staff';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import requireWeb from '../middlewares/require_web';
import { inviteValidationSchema, accessValidationSchema } from '../validations/staff';

const staffRouter = new Hono();

// Staff Members
staffRouter.get('/members', requirePermission('staff:view'), staffController.listStaffMembers);
staffRouter.patch('/members/:id', requirePermission('staff:manage'), validateBody(accessValidationSchema), staffController.updateStaffMember);
staffRouter.post('/members/:id/suspend', requirePermission('staff:manage'), staffController.suspendStaffMember);
staffRouter.post('/members/:id/activate', requirePermission('staff:manage'), staffController.activateStaffMember);
staffRouter.post('/members/:id/unlock-pin', requirePermission('staff:manage'), staffController.unlockStaffPin);
staffRouter.post('/members/:id/clear-pin', requirePermission('staff:manage'), staffController.clearStaffPin);
staffRouter.delete('/members/:id', requirePermission('staff:manage'), staffController.removeStaffMember);

// Invitations
staffRouter.get('/invitations', requirePermission('staff:view'), staffController.listInvitations);
staffRouter.post('/invitations', requirePermission('staff:invite'), validateBody(inviteValidationSchema), staffController.createInvitation);
staffRouter.post('/invitations/:id/resend', requirePermission('staff:invite'), staffController.resendInvitation);
staffRouter.post('/invitations/:id/revoke', requirePermission('staff:invite'), staffController.revokeInvitation);
staffRouter.get('/invitations/lookup/:token', staffController.lookupInvitation);
staffRouter.post('/invitations/accept/:token', requireWeb, staffController.acceptInvitation);

// Invitations sent to the signed-in person's email, across restaurants
staffRouter.get('/my-invitations', requireWeb, staffController.listMyInvitations);
staffRouter.post('/my-invitations/:id/accept', requireWeb, staffController.acceptMyInvitation);

export default staffRouter;
