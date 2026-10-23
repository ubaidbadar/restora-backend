import Restaurant from '../models/restaurant';
import Table from '../models/table';
import { runWithoutTenant } from '../middlewares/tenant_context';
import tableCode from '../utils/table_code';

/**
 * Gives every table still on an older random code its readable one (`restaurant/table-key`). The old code is kept in
 * oldCodes, so cards already printed keep opening the table. Runs when the server connects; upgraded tables are skipped.
 */
export default async function upgradeTableCodes() {
  const tables = await runWithoutTenant(() => Table.find({ qrCode: { $not: /\// } }));
  const names = new Map<string, string>();
  for (const table of tables) {
    const restaurantId = table.restaurantId ?? '';
    if (!names.has(restaurantId)) names.set(restaurantId, (await Restaurant.findById(restaurantId))?.name ?? '');
    await runWithoutTenant(() =>
      Table.updateOne({ _id: table._id, qrCode: table.qrCode }, { $set: { qrCode: tableCode(names.get(restaurantId)!, table.name) }, $addToSet: { oldCodes: table.qrCode } })
    );
  }
  if (tables.length) console.log(`[Tables] ${tables.length} QR links made readable; their old codes still open them`);
}
