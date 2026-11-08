import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createHmac } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import { runWithTenant } from '../src/middlewares/tenant_context';
import { encryptWhatsAppToken } from '../src/utils/whatsapp_crypto';
import Restaurant from '../src/models/restaurant';
import Branch from '../src/models/branch';
import MenuCategory from '../src/models/menu_category';
import MenuItem from '../src/models/menu_item';
import WhatsAppConnection from '../src/models/whatsapp_connection';
import WhatsAppMessage from '../src/models/whatsapp_message';
import Order from '../src/models/order';
import WhatsAppInvoiceDelivery from '../src/models/whatsapp_invoice_delivery';

const SECRET = 'whatsapp-staging-hmac-test';
const NUMBER = 'test-number-99';
const FROM = '923001234567';
const oldFetch = globalThis.fetch;
const keys = ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_TOKEN_ENCRYPTION_KEY',
  'WHATSAPP_LLM_API_KEY', 'WHATSAPP_LLM_API_URL', 'WHATSAPP_LLM_MODEL'] as const;
const env = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
let mongo: MongoMemoryServer;
let restaurantId = '';
let branchId = '';
let dishId = '';
let sizeId = '';
let sent: Record<string, unknown>[] = [];
let seq = 0;
let modelReply: Record<string, unknown> = { items: [], unmatched: [] };
function event(id: string, body: string, action?: string) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: NUMBER },
      messages: [{ id, from: FROM, timestamp: String(Math.floor(Date.now() / 1000)),
        type: action ? 'interactive' : 'text',
        ...(action ? { interactive: { button_reply: { id: action, title: action } } } : { text: { body } }) }] } }] }],
  };
}
async function webhook(data: unknown, valid = true) {
  const raw = JSON.stringify(data);
  const sig = createHmac('sha256', SECRET).update(valid ? raw : raw + 'tampered').digest('hex');
  return app.request('/api/v1/webhooks/whatsapp', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + sig }, body: raw,
  });
}
beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) await mongoose.connect(mongo.getUri());
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = 'test-verify-token';
  process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.WHATSAPP_LLM_API_KEY = 'test-key';
  process.env.WHATSAPP_LLM_API_URL = 'https://llm.example.test/chat';
  process.env.WHATSAPP_LLM_MODEL = 'test-model';
  const restaurant = await Restaurant.create({ name: 'Test Kitchen' });
  restaurantId = String(restaurant._id);
  await runWithTenant(restaurantId, async () => {
    const branch = await Branch.create({ name: 'Test Branch' });
    branchId = String(branch._id);
    await WhatsAppConnection.create({ branchId, wabaId: 'test-waba', phoneNumberId: NUMBER,
      phoneNumberDisplay: '+923001111111', status: 'connected', accessTokenEncrypted: encryptWhatsAppToken('mock-access-token') });
    const category = await MenuCategory.create({ name: 'Food' });
    const dish = await MenuItem.create({ categoryId: String(category._id), name: 'Chicken Karahi',
      sizes: [{ name: 'Regular', price: 1400 }] });
    dishId = String(dish._id);
    sizeId = String(dish.sizes[0]?._id);
  });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('llm.example.test')) return Response.json({ choices: [{ message: { content: JSON.stringify(modelReply) } }] });
    if (url.includes('graph.facebook.com/v26.0/')) {
      if (url.endsWith('/media')) return Response.json({ id: 'test-document-media-id' });
      if (url.endsWith('/messages')) {
        const body = JSON.parse(String(init?.body || '{}')) as Record<string, unknown>;
        sent.push(body);
        return Response.json({ messages: [{ id: 'wamid.mock.' + ++seq }] });
      }
    }
    throw new Error('Unexpected outbound URL: ' + url);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = oldFetch;
  for (const key of keys) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  await mongoose.disconnect();
  await mongo.stop();
});
describe('WhatsApp signed webhook and order integration (mock Graph and LLM)', () => {
  it('rejects bad signatures and unchanged incorrect verify token', async () => {
    expect((await webhook(event('bad-hmac', 'menu'), false)).status).toBe(401);
    const verification = await app.request('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123');
    expect(verification.status).toBe(403);
    expect(await verification.json()).toEqual({ message: 'Verification token mismatch' });
  });
  it('stores each Meta ID once and sends a menu from the restaurant number', async () => {
    const data = event('inbound-menu-1', 'menu');
    expect((await webhook(data)).status).toBe(200);
    expect((await webhook(data)).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      expect(await WhatsAppMessage.countDocuments({ metaMessageId: 'inbound-menu-1' })).toBe(1);
      const incoming = await WhatsAppMessage.findOne({ metaMessageId: 'inbound-menu-1' });
      expect(incoming?.branchId).toBe(branchId);
      expect(incoming?.phone).toBe('03001234567');
      expect(incoming?.processedAt).toBeDefined();
    });
    expect(sent.some((payload) => payload.type === 'interactive')).toBe(true);
  });
  it('never places an order before Confirm, even with a valid LLM interpretation', async () => {
    modelReply = { items: [{ itemId: dishId, sizeId, qty: 2, rawName: 'Chicken Karahi' }], unmatched: [] };
    expect((await webhook(event('inbound-typed-1', '2 Chicken Karahi'))).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      expect(await Order.countDocuments({ whatsappPhone: '03001234567' })).toBe(0);
    });
    expect(sent.some((payload) => JSON.stringify(payload).includes('Confirm'))).toBe(true);
  });
  it('clarifies ambiguous or unmatched dishes and cannot submit a different dish', async () => {
    modelReply = { items: [], unmatched: ['Mystery Pizza'] };
    expect((await webhook(event('inbound-typed-2', 'Mystery Pizza'))).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      expect(await Order.countDocuments({ whatsappPhone: '03001234567' })).toBe(0);
    });
  });
  it('rejects a stale Confirm button after the customer changes the cart', async () => {
    const latestConfirm = () => {
      const interactive = sent.filter((payload) => payload.type === 'interactive').at(-1);
      const buttons = (interactive?.interactive as { action?: { buttons?: { reply?: { id?: string } }[] } } | undefined)?.action?.buttons || [];
      return buttons.find((button) => button.reply?.id?.startsWith('confirm:'))?.reply?.id;
    };
    modelReply = { items: [{ itemId: dishId, sizeId, qty: 1, rawName: 'Chicken Karahi' }], unmatched: [] };
    expect((await webhook(event('stale-first-quote', '1 Chicken Karahi'))).status).toBe(200);
    const staleAction = latestConfirm();
    expect(staleAction?.startsWith('confirm:')).toBe(true);
    modelReply = { items: [{ itemId: dishId, sizeId, qty: 2, rawName: 'Chicken Karahi' }], unmatched: [] };
    expect((await webhook(event('stale-second-quote', '2 Chicken Karahi'))).status).toBe(200);
    expect(latestConfirm()).not.toBe(staleAction);
    expect((await webhook(event('stale-confirm-tap', '', staleAction))).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      expect(await Order.countDocuments({ whatsappPhone: '03001234567' })).toBe(0);
    });
  });
  it('confirmed cart creates one pending order and sends priced bill plus PDF', async () => {
    // Restore a valid quote after an unrelated unmatched message.
    modelReply = { items: [{ itemId: dishId, sizeId, qty: 2, rawName: 'Chicken Karahi' }], unmatched: [] };
    expect((await webhook(event('inbound-typed-3', '2 Chicken Karahi'))).status).toBe(200);
    const interactive = sent.filter((payload) => payload.type === 'interactive').at(-1);
    const buttons = (interactive?.interactive as { action?: { buttons?: { reply?: { id?: string } }[] } } | undefined)?.action?.buttons || [];
    const actionId = buttons.find((button) => button.reply?.id?.startsWith('confirm:'))?.reply?.id;
    expect(actionId?.startsWith('confirm:')).toBe(true);
    const confirm = event('inbound-confirm-1', '', actionId);
    expect((await webhook(confirm)).status).toBe(200);
    expect((await webhook(confirm)).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      const orders = await Order.find({ whatsappPhone: '03001234567' });
      expect(orders).toHaveLength(1);
      expect(orders[0]?.status).toBe('pending');
      expect(orders[0]?.total).toBe(2800);
      expect(orders[0]?.whatsappPhoneNumberId).toBe(NUMBER);
      expect(orders[0]?.customer?.phone).toBe('+923001234567');
      const invoice = await WhatsAppInvoiceDelivery.findOne({ orderId: String(orders[0]?._id), stage: 'confirmed' });
      expect(invoice?.status).toBe('sent');
    });
    expect(sent.some((payload) => payload.type === 'document')).toBe(true);
    expect(sent.some((payload) => JSON.stringify(payload).includes('Rs 2800'))).toBe(true);
  });
  it('records Meta read receipts and ignores late delivered/sent downgrades', async () => {
    const outbound = await runWithTenant(restaurantId, () =>
      WhatsAppMessage.findOne({ direction: 'outbound', messageType: 'document' }).sort({ receivedAt: -1 }));
    expect(outbound?.metaMessageId).toBeTruthy();
    const receipt = (status: string) => ({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { metadata: { phone_number_id: NUMBER }, statuses: [{
        id: outbound!.metaMessageId, recipient_id: FROM, status, timestamp: String(Math.floor(Date.now() / 1000)),
      }] } }] }],
    });
    expect((await webhook(receipt('sent'))).status).toBe(200);
    expect((await webhook(receipt('delivered'))).status).toBe(200);
    expect((await webhook(receipt('read'))).status).toBe(200);
    expect((await webhook(receipt('delivered'))).status).toBe(200);
    await runWithTenant(restaurantId, async () => {
      const updated = await WhatsAppMessage.findById(outbound!._id);
      expect(updated?.deliveryStatus).toBe('read');
    });
  });

});
