import { beforeAll, afterAll } from 'bun:test';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import orderStreamCases from './order_stream_cases';

// Change streams need a replica set, so this file runs on its own one-node set.
let replSet: MongoMemoryReplSet;

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await replSet.stop();
});

orderStreamCases('Live orders stream (replica set)', 0);
