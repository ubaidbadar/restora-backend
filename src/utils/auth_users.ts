import mongoose from 'mongoose';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** Better Auth's MongoDB adapter stores ids as ObjectIds, so a string id must be converted before querying. */
export function toObjectId(id: string): mongoose.Types.ObjectId | null {
  return OBJECT_ID.test(id) ? new mongoose.Types.ObjectId(id) : null;
}

/** Better Auth users by id, in one query. Missing users are left out of the map. */
export async function findAuthUsers(ids: string[]): Promise<Map<string, AuthUser>> {
  const map = new Map<string, AuthUser>();
  const db = mongoose.connection.db;
  const objectIds = [...new Set(ids)].map(toObjectId).filter((id): id is mongoose.Types.ObjectId => id !== null);
  if (!db || objectIds.length === 0) return map;

  const docs = await db
    .collection('user')
    .find({ _id: { $in: objectIds } }, { projection: { name: 1, email: 1, image: 1 } })
    .toArray();
  for (const doc of docs) {
    const id = String(doc._id);
    map.set(id, { id, name: doc.name ?? '', email: doc.email ?? '', image: doc.image ?? null });
  }
  return map;
}

export async function findAuthUser(id: string): Promise<AuthUser | null> {
  return (await findAuthUsers([id])).get(id) ?? null;
}

/** The Better Auth user with this email, if one has signed up. */
export async function findAuthUserByEmail(email: string): Promise<AuthUser | null> {
  const db = mongoose.connection.db;
  if (!db) return null;
  const doc = await db.collection('user').findOne({ email: email.trim().toLowerCase() }, { projection: { name: 1, email: 1, image: 1 } });
  return doc ? { id: String(doc._id), name: doc.name ?? '', email: doc.email ?? '', image: doc.image ?? null } : null;
}
