import type { AnyBulkWriteOperation } from 'mongoose';
import Restaurant from '../models/restaurant';
import Table, { type ITable } from '../models/table';
import { runWithoutTenant } from '../middlewares/tenant_context';
import lookup from '../utils/lookup';
import tableCode from '../utils/table_code';

/**
 * Gives every table still on an older random code its readable one (`restaurant/table-key`). The old code is kept in
 * oldCodes, so cards already printed keep opening the table. Runs when the server connects; upgraded tables are skipped.
 * One read (each table with its restaurant's name) and one bulk write, however many tables there are.
 */
export default async function upgradeTableCodes() {
  const tables = await runWithoutTenant(() =>
    Table.aggregate<{ _id: string; name: string; qrCode: string; restaurant?: string }>([
      { $match: { qrCode: { $not: /\// } } },
      ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $project: { name: 1 } }] }),
      { $project: { name: 1, qrCode: 1, restaurant: { $first: '$restaurant.name' } } },
    ])
  );
  if (!tables.length) return;

  const updates: AnyBulkWriteOperation<ITable>[] = tables.map((table) => ({
    updateOne: {
      // Only if nothing changed the code meanwhile (another server process, a new QR code).
      filter: { _id: table._id, qrCode: table.qrCode },
      update: { $set: { qrCode: tableCode(table.restaurant ?? '', table.name) }, $addToSet: { oldCodes: table.qrCode } },
    },
  }));
  await runWithoutTenant(() => Table.bulkWrite(updates, { ordered: false }));
  console.log(`[Tables] ${tables.length} QR links made readable; their old codes still open them`);
}
