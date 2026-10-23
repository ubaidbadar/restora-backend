import type { Context } from 'hono';
import { MAX_IMAGE_BYTES, uploadToCloudflare } from '../services/cloudflare_storage';
import photoVariants, { PHOTO_WIDTHS } from '../services/photo_variants';
import type { IPhotoSizes } from '../models/photo_sizes_schema';
import httpError from './http_error';
import randomToken from './random_token';

/** What a saved photo field becomes: the large photo's URL (older apps read only this) and its smaller sizes. */
export interface StoredPhoto {
  photo: string;
  photoSizes?: IPhotoSizes;
}

/** Saves the sizes of one photo under `prefix` (`r_<restaurant>/dishes`) with one name, and answers their URLs. */
export async function savePhotoVariants(input: Buffer | Uint8Array, prefix: string): Promise<StoredPhoto | null> {
  const variants = await photoVariants(input);
  if (!variants) return null;
  // A new name for every photo, so a cached old photo is never shown for a new one.
  const name = `${prefix}/${Date.now()}_${randomToken(9)}`;
  const [sm, md, lg] = await Promise.all(
    (Object.keys(PHOTO_WIDTHS) as (keyof typeof PHOTO_WIDTHS)[]).map((size) =>
      uploadToCloudflare(variants.files[size], { key: `${name}-${PHOTO_WIDTHS[size]}.webp`, contentType: 'image/webp' })
    )
  );
  return { photo: lg!.url, photoSizes: { sm: sm!.url, md: md!.url, width: variants.width, height: variants.height, blur: variants.blur } };
}

/**
 * A photo field as it should be saved. A data URL (a new photo) is made into its sizes and uploaded under the
 * restaurant's folder; an http(s) or /uploads URL is kept as it is; null or empty clears it. Answers undefined when the
 * field was not sent. Anything else is refused, so raw data never lands in the database.
 */
export default async function storePhoto(c: Context, value: string | null | undefined, folder: string): Promise<StoredPhoto | null | undefined> {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (value.startsWith('data:')) {
    const match = value.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/);
    const buffer = match ? Buffer.from(match[2]!, 'base64') : null;
    const saved = buffer && buffer.byteLength <= MAX_IMAGE_BYTES ? await savePhotoVariants(buffer, `r_${c.get('restaurantId')}/${folder}`) : null;
    if (!saved) throw httpError(400, 'Use a JPEG, PNG, WebP or GIF image of up to 5 MB');
    return saved;
  }
  if (/^https:\/\//.test(value) || value.startsWith('/uploads/')) return { photo: value };
  throw httpError(400, 'That image address is not valid');
}
