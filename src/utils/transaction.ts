import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs operations within a MongoDB transaction.
 * If the MongoDB instance is standalone (does not support transactions/replica sets),
 * it seamlessly falls back to non-transactional execution.
 */
export async function runInTransaction<T>(fn: (session?: ClientSession) => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = mongoose.connection.getClient?.() as any;
  const topology = client?.topology?.description;
  const isReplicaOrSharded = Boolean(
    topology?.setName ||
      topology?.type === 'ReplicaSetWithPrimary' ||
      topology?.type === 'ReplicaSetNoPrimary' ||
      topology?.type === 'Sharded'
  );

  if (!isReplicaOrSharded) {
    // Standalone deployment - transactions unsupported
    return await fn(undefined);
  }

  let session: ClientSession | undefined;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error: unknown) {
    if (session && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch {
        // Ignore abort errors
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    const msg = String(err?.message || err?.errmsg || '');
    if (
      msg.includes('replica set') ||
      msg.includes('retryable writes') ||
      msg.includes('Transaction numbers') ||
      err?.code === 20 ||
      err?.errorResponse?.code === 20
    ) {
      // Standalone MongoDB without replica set
      return await fn(undefined);
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

export default runInTransaction;
