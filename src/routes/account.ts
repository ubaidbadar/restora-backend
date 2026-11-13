import { Hono } from 'hono';
import accountController from '../controllers/account';
import validateBody from '../validations/validator';
import { profileSchema } from '../validations/restaurant_owner';
import { pinValidationSchema } from '../validations/staff';
import { branchPickSchema, workplaceSchema, workspacePreferencesSchema } from '../validations/workplace';
import requireWeb from '../middlewares/require_web';
import requireFreshSession from '../middlewares/require_fresh_session';

const accountRouter = new Hono();

// Works on a POS terminal too: it says who is unlocked.
accountRouter.get('/', accountController.getMe);

// The rest belongs to the signed-in person, not to whoever is unlocked on a terminal.
accountRouter.post('/workplace', requireWeb, validateBody(workplaceSchema), accountController.switchWorkplace);
accountRouter.post('/branch', requireWeb, validateBody(branchPickSchema), accountController.switchBranch);
accountRouter.patch('/preferences', requireWeb, validateBody(workspacePreferencesSchema), accountController.updatePreferences);
accountRouter.get('/sessions', requireWeb, accountController.listSessions);
accountRouter.post('/sessions/revoke-others', requireWeb, accountController.revokeOtherSessions);
accountRouter.delete('/sessions/:token', requireWeb, accountController.revokeSession);
accountRouter.patch('/profile', requireWeb, validateBody(profileSchema), accountController.updateProfile);
accountRouter.post('/pin', requireWeb, requireFreshSession, validateBody(pinValidationSchema), accountController.setPin);
accountRouter.delete('/', requireWeb, accountController.deleteAccount);
accountRouter.post('/delete', requireWeb, accountController.deleteAccount);

export default accountRouter;
