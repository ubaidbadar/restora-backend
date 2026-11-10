import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import rateLimit from '../src/middlewares/rate_limit';
import RateLimitBucket from '../src/models/rate_limit_bucket';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo.getUri());
  await RateLimitBucket.syncIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('API rate limiting', () => {
  it('returns 429 and Retry-After after the fixed-window allowance', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ scope: 'rate-limit-test', limit: 2, windowMs: 60_000 }));
    app.get('/health', (c) => c.text('ok'));
    const request = () => app.request('/health', { headers: { 'x-forwarded-for': '203.0.113.10' } });
    expect((await request()).status).toBe(200);
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(limited.headers.get('x-ratelimit-remaining')).toBe('0');
  });

  it('keeps separate client addresses in separate buckets', async () => {
    const app = new Hono();
    app.use('*', rateLimit({ scope: 'rate-limit-isolation-test', limit: 1, windowMs: 60_000 }));
    app.get('/health', (c) => c.text('ok'));
    const one = await app.request('/health', { headers: { 'x-forwarded-for': '203.0.113.11' } });
    const two = await app.request('/health', { headers: { 'x-forwarded-for': '203.0.113.12' } });
    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
  });
});
