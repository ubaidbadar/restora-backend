import type { Context } from 'hono';
import { uploadDataUrlToCloudflare } from '../services/cloudflare_storage';
import httpError from './http_error';

/**
 * A photo or logo field as it should be saved: a data URL is uploaded under the restaurant's folder and becomes its URL;
 * an http(s) or /uploads URL is kept; empty clears it. Anything else is refused, so raw data never lands in the database.
 */
export default async function storeImage(c: Context, value: string | null | undefined, folder: string): Promise<string | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value.startsWith('data:')) {
    const uploaded = await uploadDataUrlToCloudflare(value, `r_${c.get('restaurantId')}/${folder}`);
    if (!uploaded) throw httpError(400, 'Use a JPEG, PNG, WebP or GIF image of up to 5 MB');
    return uploaded.url;
  }
  if (/^https:\/\//.test(value) || value.startsWith('/uploads/')) return value;
  throw httpError(400, 'That image address is not valid');
}
