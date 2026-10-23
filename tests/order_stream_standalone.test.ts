import { beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import orderStreamCases from './order_stream_cases';

// A plain mongod, as on a VPS: no change streams, so the stream polls for what changed.
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

orderStreamCases('Live orders stream (standalone MongoDB)', 2_000);
