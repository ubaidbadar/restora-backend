import sharp from 'sharp';

/** The widths every photo is saved at: list rows (sm), cards and the guest menu (md), a photo opened large (lg). */
export const PHOTO_WIDTHS = { sm: 160, md: 480, lg: 1200 } as const;

export interface PhotoVariants {
  files: Record<keyof typeof PHOTO_WIDTHS, Buffer>;
  /** The size of the largest file, so pages keep the photo's space before it loads. */
  width: number;
  height: number;
  /** A tiny blurred WebP as a data URL (a few hundred bytes), shown while the real photo loads. */
  blur: string;
}

/**
 * One uploaded photo as the sizes the apps show: WebP, turned upright from the camera's EXIF, never enlarged. A phone
 * photo of several MB becomes about 10 KB (sm), 40 KB (md) and 150 KB (lg). Answers null for a file that isn't an image.
 */
export default async function photoVariants(input: Buffer | Uint8Array): Promise<PhotoVariants | null> {
  try {
    const upright = sharp(input, { failOn: 'error' }).rotate();
    const resized = async (width: number) => upright.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 74, effort: 4 }).toBuffer({ resolveWithObject: true });
    const [sm, md, lg, tiny] = await Promise.all([
      resized(PHOTO_WIDTHS.sm),
      resized(PHOTO_WIDTHS.md),
      resized(PHOTO_WIDTHS.lg),
      upright.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer(),
    ]);
    return {
      files: { sm: sm.data, md: md.data, lg: lg.data },
      width: lg.info.width,
      height: lg.info.height,
      blur: `data:image/webp;base64,${tiny.toString('base64')}`,
    };
  } catch {
    return null;
  }
}
