import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { app } from '../index';
import Table from '../src/models/table';
import upgradeTableCodes from '../src/workers/table_codes';

// restora.live, rendered by this server: the pages answer as HTML, and a table's menu is read into the page.

let mongod: MongoMemoryServer;

beforeAll(async () => {
  // The pages link to the built CSS and script, so the site is built once if it has not been.
  if (!(await Bun.file(`${import.meta.dir}/../site/dist/manifest.json`).exists())) {
    expect(Bun.spawnSync(['bun', 'site/build.ts'], { cwd: `${import.meta.dir}/..` }).success).toBe(true);
  }
  mongod = await MongoMemoryServer.create();
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongod.getUri());
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

type Json = Record<string, any>;

async function owner(email = 'site-owner@test.com') {
  const signup = await app.request('/api/v1/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, name: 'Sana Owner', password: 'StrongPassword123!' }),
  });
  const cookie = signup.headers.get('set-cookie') || '';
  const onboarding = await app.request('/api/v1/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ name: 'Lahori Karahi House', branchName: 'Gulberg' }),
  });
  const { restaurantId } = (await onboarding.json()) as Json;
  return (method: string, path: string, body?: unknown) =>
    app.request(`/api/v1${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'x-restaurant-id': restaurantId },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
}

describe('Site', () => {
  it('serves every marketing page as HTML with its own title, and no script', async () => {
    for (const [path, title] of [
      ['/', 'Restora: Orders, tables and khata for your restaurant'],
      ['/features', 'Restaurant POS features: orders, QR tables, khata | Restora'],
      ['/pricing', 'Pricing: free restaurant software, no card | Restora'],
      ['/contact', 'Contact us on WhatsApp or email | Restora'],
      ['/privacy', 'Privacy policy | Restora'],
    ]) {
      const res = await app.request(path!);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).toContain(`<title>${title}</title>`);
      expect(html).not.toContain('type="module"');
    }
  });

  it('points each page\'s share link and canonical at the page itself', async () => {
    const html = await (await app.request('/pricing')).text();
    expect(html).toContain('<link rel="canonical" href="https://restora.live/pricing"/>');
    expect(html).toContain('<meta property="og:url" content="https://restora.live/pricing"/>');
    expect(html).toContain('"@type":"BreadcrumbList"');
    expect(await (await app.request('/')).text()).toContain('"logo":"https://restora.live/apple-icon.png"');
  });

  it('hydrates the demo form, and answers 404 for a page that is not there', async () => {
    expect(await (await app.request('/demo')).text()).toContain('id="page-data"');
    const missing = await app.request('/no-such-page');
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('This page isn&#x27;t on the menu.');
  });

  it('serves robots.txt, the sitemap, the manifest and llms.txt', async () => {
    expect(await (await app.request('/robots.txt')).text()).toContain('Sitemap: https://restora.live/sitemap.xml');
    expect(await (await app.request('/sitemap.xml')).text()).toContain('<loc>https://restora.live/pricing</loc>');
    expect(((await (await app.request('/manifest.webmanifest')).json()) as Json).name).toBe('Restora');
    expect(await (await app.request('/llms.txt')).text()).toContain('# Restora');
  });

  it("renders a table's menu from the database into the page", async () => {
    const api = await owner();
    const cat = (await (await api('POST', '/menu/categories', { name: 'Karahi' })).json()) as Json;
    await api('POST', '/menu/items', { categoryId: cat._id, name: 'Chicken karahi', sizes: [{ price: 1200 }] });
    const [table] = (await (await api('POST', '/tables/batch', { names: ['T4'], section: 'Hall' })).json()) as Json[];

    const res = await app.request(`/t/${table!.qrCode}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('Lahori Karahi House');
    expect(html).toContain('Chicken karahi');
    expect(html).toContain('Rs 1,200');
    expect(html).toContain('noindex, nofollow');
    // The browser gets the same menu to take the page over, with no request of its own.
    const data = JSON.parse(html.match(/<script id="page-data" type="application\/json">(.*?)<\/script>/)![1]!) as Json;
    expect(data.page).toBe('table_page');
    expect(data.props.menu.items[0].name).toBe('Chicken karahi');

    const gone = await app.request('/t/not-a-table-code');
    expect(gone.status).toBe(404);
    expect(await gone.text()).toContain('menu isn&#x27;t here');
  });

  it('gives a table a readable link, and an older code keeps opening it until a new QR code', async () => {
    const api = await owner('links-owner@test.com');
    const [table] = (await (await api('POST', '/tables/batch', { names: ['Family Hall 2'], section: 'Hall' })).json()) as Json[];
    expect(table!.qrCode).toMatch(/^lahori-karahi-house\/family-hall-2-[2-9a-z]{6}$/);
    expect((await app.request(`/t/${table!.qrCode}`)).status).toBe(200);
    expect((await app.request(`/api/v1/public/t/${table!.qrCode}`)).status).toBe(200);

    // A table from before readable links: it gets one, and the code on its printed card still opens it.
    await Table.updateOne({ _id: table!._id }, { $set: { qrCode: 'oldRandomCode123' } });
    await upgradeTableCodes();
    const upgraded = (await Table.findById(table!._id))!;
    expect(upgraded.qrCode).toMatch(/^lahori-karahi-house\/family-hall-2-[2-9a-z]{6}$/);
    expect(upgraded.oldCodes).toEqual(['oldRandomCode123']);
    expect((await app.request('/t/oldRandomCode123')).status).toBe(200);
    expect((await app.request(`/t/${upgraded.qrCode}`)).status).toBe(200);
    const call = await app.request(`/api/v1/public/t/${upgraded.qrCode}/call`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'waiter' }) });
    expect(call.status).toBeLessThan(300);

    // A new QR code is for a lost card: the earlier codes stop opening the table.
    const fresh = (await (await api('POST', `/tables/${table!._id}/qr`)).json()) as Json;
    expect(fresh.qrCode).not.toBe(upgraded.qrCode);
    expect((await app.request('/t/oldRandomCode123')).status).toBe(404);
    expect((await app.request(`/t/${upgraded.qrCode}`)).status).toBe(404);
    expect((await app.request(`/t/${fresh.qrCode}`)).status).toBe(200);
  });
});
