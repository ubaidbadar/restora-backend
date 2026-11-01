import type { Context } from 'hono';
import {
  uploadToCloudflare,
  uploadDataUrlToCloudflare,
  deleteFromCloudflare,
  getPresignedUploadUrl,
  isCloudflareConfigured,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  safeFolder,
} from '../services/cloudflare_storage';
import logAudit from '../utils/audit';

/** Every stored file sits under its restaurant's folder, so one restaurant cannot touch another's files. */
const tenantPrefix = (c: Context, folder: unknown) => `r_${c.get('restaurantId')}/${safeFolder(folder)}`;

const uploadJson = (result: { url: string; key: string; size: number; contentType?: string }) => ({
  url: result.url,
  key: result.key,
  size: result.size,
  contentType: result.contentType,
  storage: isCloudflareConfigured() ? 'cloudflare-r2' : 'local',
});

export async function uploadFile(c: Context) {
  const contentType = c.req.header('content-type') || '';
  const user = c.get('user');

  if (contentType.includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body['file'] || body['image'] || body['logo'] || body['photo'];

    if (!(file instanceof File)) {
      return c.json({ message: 'No file provided in form field (file, image, logo, photo)' }, 400);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return c.json({ message: 'File is too large. Maximum size is 5 MB.' }, 400);
    }
    if (!IMAGE_TYPES[file.type]) {
      return c.json({ message: `File type "${file.type}" not allowed. Upload a JPEG, PNG, WebP or GIF image.` }, 400);
    }

    const result = await uploadToCloudflare(new Uint8Array(await file.arrayBuffer()), {
      prefix: tenantPrefix(c, body['folder']),
      contentType: file.type,
    });

    await logAudit({
      action: 'file.uploaded',
      actor: { userId: user?.id, name: user?.name, via: 'web' },
      target: { type: 'upload', id: result.key, label: result.url },
    });
    return c.json(uploadJson(result), 201);
  }

  const json = await c.req.json().catch(() => null);
  if (typeof json?.dataUrl === 'string') {
    const result = await uploadDataUrlToCloudflare(json.dataUrl, tenantPrefix(c, json.folder));
    if (!result) {
      return c.json({ message: 'Send a JPEG, PNG, WebP or GIF image of up to 5 MB as a data URL' }, 400);
    }

    await logAudit({
      action: 'file.uploaded',
      actor: { userId: user?.id, name: user?.name, via: 'web' },
      target: { type: 'upload', id: result.key, label: result.url },
    });
    return c.json(uploadJson(result), 201);
  }

  return c.json({ message: 'Unsupported upload format. Use multipart/form-data or JSON with dataUrl.' }, 400);
}

export async function presignUpload(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body?.contentType || !IMAGE_TYPES[body.contentType]) {
    return c.json({ message: 'Send the contentType of a JPEG, PNG, WebP or GIF image' }, 400);
  }

  const presigned = await getPresignedUploadUrl(String(body.filename ?? 'image'), body.contentType, tenantPrefix(c, body.folder));
  if (!presigned) {
    return c.json({ message: 'Cloudflare R2 is not configured for presigned direct uploads' }, 501);
  }
  return c.json(presigned);
}

export async function deleteUploadedFile(c: Context) {
  const key = decodeURIComponent(c.req.param('key') || '');
  // Only files of this restaurant, and no path tricks.
  if (!key.startsWith(`r_${c.get('restaurantId')}/`) || key.includes('..')) {
    return c.json({ message: 'File not found' }, 404);
  }

  const success = await deleteFromCloudflare(key);
  if (!success) {
    return c.json({ message: 'File not found or could not be deleted' }, 404);
  }
  return c.json({ success: true, message: 'File deleted successfully' });
}

export default {
  uploadFile,
  presignUpload,
  deleteUploadedFile,
};
