import type { Context } from 'hono';
import Settings from '../models/settings';
import Restaurant from '../models/restaurant';
import logAudit from '../utils/audit';
import storeImage from '../utils/store_image';
import { runWithoutTenant } from '../middlewares/tenant_context';
import { uploadToCloudflare, IMAGE_TYPES, MAX_IMAGE_BYTES } from '../services/cloudflare_storage';

/** This restaurant's settings, created from the restaurant on first read. */
async function loadSettings(c: Context) {
  const existing = await Settings.findOne({});
  if (existing) return existing;
  const restaurant = await runWithoutTenant(() => Restaurant.findById(c.get('restaurantId')));
  return Settings.create({
    restaurantName: restaurant?.name || 'Restaurant',
    logo: restaurant?.logo,
    onboarded: false,
    taxSet: false,
  });
}

export async function getSettings(c: Context) {
  return c.json(await loadSettings(c));
}

export async function updateSettings(c: Context) {
  const body = c.get('validatedJson') as {
    restaurantName?: string;
    logo?: string | null;
    taxByPaymentMethod?: Record<string, number>;
    dineInServiceCharge?: { enabled: boolean; type: 'percentage' | 'fixed'; value: number; taxable: boolean };
    whatsappTemplates?: Record<string, string>;
    receipt?: Record<string, string>;
    appearance?: Record<string, string>;
  };

  const settings = await loadSettings(c);
  const logo = await storeImage(c, body.logo, 'logos');

  if (body.restaurantName) settings.restaurantName = body.restaurantName;
  if (logo !== undefined) settings.logo = logo ?? undefined;
  // Partial updates change only the keys sent; the other rates and templates stay as they were.
  for (const [method, rate] of Object.entries(body.taxByPaymentMethod ?? {})) {
    settings.set(`taxByPaymentMethod.${method}`, rate);
  }
  if (body.taxByPaymentMethod && Object.keys(body.taxByPaymentMethod).length > 0) settings.taxSet = true;
  if (body.dineInServiceCharge) settings.set('dineInServiceCharge', body.dineInServiceCharge);
  for (const [key, text] of Object.entries(body.whatsappTemplates ?? {})) {
    settings.set(`whatsappTemplates.${key}`, text);
  }
  for (const [key, text] of Object.entries(body.receipt ?? {})) {
    settings.set(`receipt.${key}`, text || undefined);
  }
  for (const [key, value] of Object.entries(body.appearance ?? {})) {
    settings.set(`appearance.${key}`, value);
  }
  settings.updatedAt = new Date().toISOString();
  await settings.save();

  if (body.restaurantName || logo !== undefined) {
    const updates: Record<string, unknown> = {};
    if (body.restaurantName) updates.name = body.restaurantName;
    if (logo !== undefined) updates.logo = logo ?? undefined;
    await runWithoutTenant(() => Restaurant.findByIdAndUpdate(c.get('restaurantId'), { $set: updates }));
  }

  const user = c.get('user');
  await logAudit({
    action: 'settings.updated',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'settings' },
  });

  return c.json(settings.toJSON());
}

export async function uploadLogo(c: Context) {
  let logoUrl: string | null | undefined;
  let key: string | undefined;

  if ((c.req.header('content-type') || '').includes('multipart/form-data')) {
    const body = await c.req.parseBody();
    const file = body['file'] || body['logo'] || body['image'];
    if (!(file instanceof File) || !IMAGE_TYPES[file.type] || file.size > MAX_IMAGE_BYTES) {
      return c.json({ message: 'Use a JPEG, PNG, WebP or GIF image of up to 5 MB' }, 400);
    }
    const result = await uploadToCloudflare(new Uint8Array(await file.arrayBuffer()), {
      prefix: `r_${c.get('restaurantId')}/logos`,
      contentType: file.type,
    });
    logoUrl = result.url;
    key = result.key;
  } else {
    const json = await c.req.json().catch(() => null);
    if (typeof json?.dataUrl !== 'string' || !json.dataUrl.startsWith('data:')) {
      return c.json({ message: 'No valid image file uploaded' }, 400);
    }
    logoUrl = await storeImage(c, json.dataUrl, 'logos');
  }

  const settings = await loadSettings(c);
  settings.logo = logoUrl ?? undefined;
  settings.updatedAt = new Date().toISOString();
  await settings.save();
  await runWithoutTenant(() => Restaurant.findByIdAndUpdate(c.get('restaurantId'), { $set: { logo: logoUrl } }));

  const user = c.get('user');
  await logAudit({
    action: 'settings.logo_uploaded',
    actor: { userId: user?.id, name: user?.name, via: 'web' },
    target: { type: 'settings', label: logoUrl ?? undefined },
  });

  return c.json({ logo: logoUrl, key });
}

export default {
  get: getSettings,
  update: updateSettings,
  uploadLogo,
};
