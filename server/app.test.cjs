const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createApp } = require('./app.cjs');
const { hashPassword } = require('./password.cjs');
const testRoot = path.resolve(__dirname, '../output/server-tests');
mkdirSync(testRoot, { recursive: true });
const password = 'test-only-password-12345';
const hash = hashPassword(password);

async function fixture(options = {}) {
  const config = { dataDir: mkdtempSync(path.join(testRoot, 'case-')), origin: 'http://127.0.0.1:4174',
    adminEmail: 'admin@example.test', passwordHash: hash, secure: false,
    mailFrom: 'site@example.test', notifyEmail: 'owner@example.test', ...options };
  const runtime = createApp(config);
  const server = await new Promise(resolve => { const server = runtime.app.listen(0, '127.0.0.1', () => resolve(server)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (url, method = 'GET', body, cookie, origin = config.origin) => fetch(base + url, {
    method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const login = async () => { const response = await request('/api/admin/login', 'POST', { email: config.adminEmail, password }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
  return { ...runtime, request, login, config, stop: async () => { await new Promise(resolve => server.close(resolve)); runtime.close(); } };
}
const enquiry = () => ({ name: 'Test Client', email: 'client@example.test', message: 'A custom iOS and Android booking app.', services: ['iOS / Android app', 'Custom AI agent'], timing: 'Within 1–2 months', requestId: randomUUID(), website: '' });

test('submissions persist across restarts; retries deduplicate; admin can follow up', async () => {
  let f = await fixture();
  try {
    const body = enquiry();
    assert.equal((await f.request('/api/enquiries', 'POST', body)).status, 201);
    assert.equal((await f.request('/api/enquiries', 'POST', body)).status, 200);
    assert.equal((await f.request('/api/enquiries', 'POST', {...body, message: 'Changed project details'})).status, 409);
    const dataDir = f.config.dataDir;
    await f.stop(); f = await fixture({ dataDir });
    const cookie = await f.login();
    const result = await (await f.request('/api/admin/enquiries', 'GET', undefined, cookie)).json();
    assert.equal(result.total, 1); assert.deepEqual(result.items[0].services, body.services);
    const id = result.items[0].id;
    assert.equal((await f.request(`/api/admin/enquiries/${id}`, 'PATCH', {status:'contacted', notes:'Call next week'}, cookie)).status, 200);
    const filtered = await (await f.request('/api/admin/enquiries?status=contacted&q=booking', 'GET', undefined, cookie)).json();
    assert.equal(filtered.total, 1); assert.equal(filtered.items[0].notes, 'Call next week');
    assert.equal((await f.request('/api/admin/logout', 'POST', {}, cookie)).status, 200);
    assert.equal((await f.request('/api/admin/enquiries', 'GET', undefined, cookie)).status, 401);
  } finally { await f.stop(); }
});

test('private data and source are not public; writes require same origin and login', async () => {
  const f = await fixture({ secure: true });
  try {
    for (const url of ['/api/admin/enquiries', '/api/admin/session']) assert.equal((await f.request(url)).status, 401);
    for (const url of ['/.env', '/server/app.cjs', '/data/enquiries.sqlite', '/package.json', '/output/server-tests', '/.git/config']) assert.equal((await f.request(url)).status, 404);
    assert.equal((await f.request('/api/enquiries', 'POST', enquiry(), null, 'https://attacker.test')).status, 403);
    assert.equal((await f.request('/api/admin/login', 'POST', {email:'admin@example.test', password:'incorrect'})).status, 401);
    const response = await f.request('/api/admin/login', 'POST', {email:'admin@example.test', password});
    const cookie = response.headers.get('set-cookie');
    for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure']) assert.ok(cookie.includes(flag));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal((await f.request('/api/admin/enquiries/unknown', 'PATCH', {status:'closed', notes:''}, cookie, 'https://attacker.test')).status, 403);
    f.db.prepare('UPDATE sessions SET expires = 0').run();
    assert.equal((await f.request('/api/admin/session', 'GET', undefined, cookie)).status, 401);
  } finally { await f.stop(); }
});

test('input limits, honeypot and rate limiting reject bad submissions', async () => {
  const f = await fixture();
  try {
    for (const overrides of [{email:'bad\r\nBcc: victim@example.test'}, {message:'short'}, {services:['Unknown']}, {name:'x'.repeat(101)}, {website:'spam'}, {timing:'invalid'}]) assert.equal((await f.request('/api/enquiries', 'POST', {...enquiry(), ...overrides})).status, 400);
    assert.equal(f.db.prepare('SELECT count(*) AS n FROM enquiries').get().n, 0);
    for (let i = 0; i < 4; i++) assert.equal((await f.request('/api/enquiries', 'POST', enquiry())).status, 201);
    const response = await f.request('/api/enquiries', 'POST', enquiry());
    assert.equal(response.status, 429); assert.ok(response.headers.get('retry-after'));
  } finally { await f.stop(); }
});

test('notification failure keeps the enquiry; a successful retry addresses only the owner', async () => {
  let fail = true, delivered;
  const f = await fixture({ sendMail: async mail => { if (fail) throw new Error('SMTP unavailable'); delivered = mail; } });
  try {
    const body = enquiry();
    await f.request('/api/enquiries', 'POST', body);
    for (let i = 0; i < 5; i++) { f.db.prepare('UPDATE enquiries SET next_attempt = 0').run(); await f.deliverNotifications(); }
    let row = f.db.prepare('SELECT * FROM enquiries').get();
    assert.equal(row.notification, 'failed'); assert.equal(row.message, body.message);
    const cookie = await f.login();
    assert.equal((await f.request(`/api/admin/enquiries/${row.id}/retry`, 'POST', {}, cookie)).status, 200);
    fail = false; await f.deliverNotifications();
    row = f.db.prepare('SELECT * FROM enquiries').get();
    assert.equal(row.notification, 'sent'); assert.equal(delivered.to, 'owner@example.test'); assert.equal(delivered.replyTo, body.email);
  } finally { await f.stop(); }
});

test('without SMTP the enquiry stays queued and admin is informed; login throttles', async () => {
  const f = await fixture();
  try {
    await f.request('/api/enquiries', 'POST', enquiry()); await f.deliverNotifications();
    assert.equal(f.db.prepare('SELECT notification FROM enquiries').get().notification, 'pending');
    const cookie = await f.login();
    assert.equal((await (await f.request('/api/admin/session', 'GET', undefined, cookie)).json()).notificationsConfigured, false);
    for (let i = 0; i < 4; i++) assert.equal((await f.request('/api/admin/login', 'POST', {email:'admin@example.test', password:'wrong'})).status, 401);
    assert.equal((await f.request('/api/admin/login', 'POST', {email:'admin@example.test', password})).status, 429);
  } finally { await f.stop(); }
});

test('inbox pagination has no missing records and oversized bodies are rejected', async () => {
  const f = await fixture();
  try {
    for (let i = 0; i < 21; i++) {
      f.db.prepare('DELETE FROM limits').run();
      assert.equal((await f.request('/api/enquiries', 'POST', {...enquiry(), name:`Client ${i}`})).status, 201);
    }
    const cookie = await f.login();
    const first = await (await f.request('/api/admin/enquiries?page=1', 'GET', undefined, cookie)).json();
    const second = await (await f.request('/api/admin/enquiries?page=2', 'GET', undefined, cookie)).json();
    assert.equal(first.total, 21); assert.equal(first.items.length, 20); assert.equal(second.items.length, 1);
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 21);
    assert.equal((await f.request('/api/enquiries', 'POST', {...enquiry(), message:'x'.repeat(25000)})).status, 413);
  } finally { await f.stop(); }
});
