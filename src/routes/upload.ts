import { Hono } from 'hono';
import uploadController from '../controllers/upload';
import { requireAnyPermission } from '../middlewares/permission_guard';

const uploadRouter = new Hono();

// Images are for dishes and the logo, so only people who edit those may store or delete them.
const canUpload = requireAnyPermission(['menu:update', 'settings:manage']);

uploadRouter.post('/', canUpload, uploadController.uploadFile);
uploadRouter.post('/presign', canUpload, uploadController.presignUpload);
uploadRouter.delete('/:key{.+}', canUpload, uploadController.deleteUploadedFile);

export default uploadRouter;
