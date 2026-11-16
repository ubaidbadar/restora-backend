import { Hono } from 'hono';
import menuController from '../controllers/menu';
import requirePermission from '../middlewares/permission_guard';
import validateBody from '../validations/validator';
import {
  menuItemSchema,
  menuCategorySchema,
  menuCategoryUpdateSchema,
  menuItemUpdateSchema,
  addonGroupSchema,
  addonGroupUpdateSchema,
  stockToggleSchema,
  bulkMenuSchema,
  menuPrioritySchema,
} from '../validations/menu';

const menuRouter = new Hono();

menuRouter.get('/', requirePermission('menu:view'), menuController.getMenu);

// Categories
menuRouter.post('/categories', requirePermission('menu:update'), validateBody(menuCategorySchema), menuController.createCategory);
menuRouter.patch('/categories/:id/priority', requirePermission('menu:update'), validateBody(menuPrioritySchema), menuController.updateCategoryPriority);
menuRouter.patch('/categories/:id', requirePermission('menu:update'), validateBody(menuCategoryUpdateSchema), menuController.updateCategory);
menuRouter.delete('/categories/:id', requirePermission('menu:update'), menuController.deleteCategory);

// Addon Groups
menuRouter.post('/addon-groups', requirePermission('menu:update'), validateBody(addonGroupSchema), menuController.createAddonGroup);
menuRouter.patch('/addon-groups/:id', requirePermission('menu:update'), validateBody(addonGroupUpdateSchema), menuController.updateAddonGroup);
menuRouter.delete('/addon-groups/:id', requirePermission('menu:update'), menuController.deleteAddonGroup);

// Menu Items
menuRouter.post('/items', requirePermission('menu:update'), validateBody(menuItemSchema), menuController.createMenuItem);
menuRouter.patch('/items/:id/priority', requirePermission('menu:update'), validateBody(menuPrioritySchema), menuController.updateMenuItemPriority);
menuRouter.patch('/items/:id', requirePermission('menu:update'), validateBody(menuItemUpdateSchema), menuController.updateMenuItem);
menuRouter.delete('/items/:id', requirePermission('menu:update'), menuController.deleteMenuItem);
menuRouter.patch('/items/:id/stock', requirePermission('menu:stock'), validateBody(stockToggleSchema), menuController.toggleStock);

// Bulk import
menuRouter.post('/bulk', requirePermission('menu:update'), validateBody(bulkMenuSchema), menuController.bulkMenuImport);

export default menuRouter;
