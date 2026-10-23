import path from 'path';
import type { AnyBulkWriteOperation } from 'mongoose';
import MenuItem, { type IMenuItem } from '../models/menu_item';
import { runWithoutTenant } from '../middlewares/tenant_context';
import { savePhotoVariants } from '../utils/store_photo';

/** The bytes of a photo saved before sizes existed: from R2 (or any https URL) or the local uploads folder. */
async function readPhoto(url: string): Promise<Uint8Array | null> {
  if (url.startsWith('/uploads/')) {
    const file = Bun.file(path.join(process.env.UPLOAD_DIR || './uploads', path.basename(url)));
    return (await file.exists()) ? new Uint8Array(await file.arrayBuffer()) : null;
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  return res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

/**
 * Gives every dish photo saved before sizes existed its small sizes and blurred preview, so menus stop downloading the
 * full photo for a thumbnail. Runs in the background when the server connects: one read of the dishes still without
 * sizes, the photos made two at a time, then one bulk write. A photo changed meanwhile is left alone (the filter checks
 * its URL), and one that can't be read is skipped and tried again on the next start. The old file stays where it is.
 */
export default async function upgradePhotoSizes() {
  const dishes = await runWithoutTenant(() =>
    MenuItem.find({ photo: { $exists: true, $ne: '' }, photoSizes: { $exists: false } }, { photo: 1, restaurantId: 1 }).lean<Pick<IMenuItem, '_id' | 'photo' | 'restaurantId'>[]>()
  );
  if (!dishes.length) return;

  const updates: AnyBulkWriteOperation<IMenuItem>[] = [];
  for (let i = 0; i < dishes.length; i += 2) {
    await Promise.all(
      dishes.slice(i, i + 2).map(async (dish) => {
        const bytes = await readPhoto(dish.photo!);
        const saved = bytes && (await savePhotoVariants(bytes, `r_${dish.restaurantId}/dishes`));
        if (saved) updates.push({ updateOne: { filter: { _id: dish._id, photo: dish.photo }, update: { $set: { photo: saved.photo, photoSizes: saved.photoSizes } } } });
      })
    );
  }
  if (updates.length) await runWithoutTenant(() => MenuItem.bulkWrite(updates, { ordered: false }));
  console.log(`[Photos] ${updates.length} of ${dishes.length} dish photos given small sizes`);
}
