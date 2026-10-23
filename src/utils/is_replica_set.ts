import mongoose from 'mongoose';

/**
 * Whether the connected MongoDB is a replica set or a sharded cluster (Atlas is one), so transactions and change
 * streams work. A standalone server (a plain mongod on the VPS) answers false.
 */
export default function isReplicaSet() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const topology = (mongoose.connection.getClient?.() as any)?.topology?.description;
  return Boolean(topology?.setName || topology?.type === 'ReplicaSetWithPrimary' || topology?.type === 'ReplicaSetNoPrimary' || topology?.type === 'Sharded');
}
