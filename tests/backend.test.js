'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { createApp, normPhone } = require('../server/app');
const EV = path.join(__dirname, '..', 'data', 'events.json'), PUB = path.join(__dirname, '..', 'public');

function boot(o = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-')); let now = Date.parse('2026-10-24T10:00:00Z');
  const app = createApp({ dataDir: dir, eventsFile: EV, publicDir: PUB, adminToken: 'secret-token', now: () => now, rateLimit: 100, log: false, ...o });
  return new Promise(r => app.server.listen(0, '127.0.0.1', () => r({ app, dir, base: 'http://127.0.0.1:' + app.server.address().port, setNow: v => { now = v; }, close: () => new Promise(x => { app.server.closeAllConnections?.(); app.server.close(x); }) })));
}
const post = (b, p, d, h = {}) => fetch(b + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(d) });
const admin = { authorization: 'Bearer secret-token' };
const good = { event: 'supper-walk', name: 'Amina', phone: '0712 345 678', age18: true, remind: true, future: false };
const raw = (base, p) => new Promise(res => { const u = new URL(base); http.get({ host: u.hostname, port: u.port, path: p }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); }); });

test('phone numbers are normalised to +254 and bad ones rejected', () => {
  for (const s of ['0712345678', '0712 345 678', '+254712345678', '254712345678', '0112345678', '(0712) 345-678']) assert.match(normPhone(s), /^\+254[17]\d{8}$/, s);
  for (const s of ['', '12345', '+44 7700 900123', '0212345678', '07123456789', 'abc', null, 42]) assert.equal(normPhone(s), null, String(s));
  assert.equal(normPhone('0712 345 678'), '+254712345678');
});

test('health and events endpoints', async () => {
  const t = await boot(); try {
    assert.deepEqual(await (await fetch(t.base + '/api/health')).json(), { ok: true });
    const ev = await (await fetch(t.base + '/api/events')).json();
    assert.equal(ev.length, 2); assert.equal(ev[0].spots, 30); assert.ok(!('sample' in ev[0]));
  } finally { await t.close(); }
});

test('translate endpoint redirects to Google Translate with correct language and path', async () => {
  const t = await boot(); try {
    const r = await fetch(t.base + '/api/translate?lang=sw&path=/gatherings.html', { redirect: 'manual' });
    assert.equal(r.status, 302);
    const loc = r.headers.get('location');
    assert.ok(loc.startsWith('https://translate.google.com/translate?sl=auto&tl=sw'));
    assert.ok(loc.includes(encodeURIComponent('https://kandelakulture.example/gatherings.html')));

    const def = await fetch(t.base + '/api/translate', { redirect: 'manual' });
    assert.equal(def.status, 302);
    assert.ok(def.headers.get('location').includes('tl=sw'));
  } finally { await t.close(); }
});

test('RSVP is stored with consent records, and is idempotent', async () => {
  const t = await boot(); try {
    const r = await post(t.base, '/api/rsvp', good); assert.equal(r.status, 201);
    const rs = t.app.store.read('rsvps'); assert.equal(rs.length, 1); assert.equal(rs[0].phone, '+254712345678'); assert.equal(rs[0].name, 'Amina');
    const cs = t.app.store.read('consents'); assert.deepEqual(cs.map(c => [c.purpose, c.action]), [['event-reminders', 'grant'], ['future-gatherings', 'decline']]);
    assert.ok(cs.every(c => c.notice && c.ts));
    const again = await post(t.base, '/api/rsvp', { ...good, phone: '+254712345678' }); const j = await again.json();
    assert.equal(again.status, 200); assert.equal(j.already, true); assert.equal(t.app.store.read('rsvps').length, 1);
    assert.equal((await (await fetch(t.base + '/api/events')).json())[0].spots, 29);
  } finally { await t.close(); }
});

test('RSVP validation', async () => {
  const t = await boot(); try {
    const cases = [[{ ...good, name: '  ' }, 'name'], [{ ...good, phone: '12345' }, 'Kenyan'], [{ ...good, age18: false }, '18'], [{ ...good, age18: undefined }, '18'], [{ ...good, event: 'nope' }, 'choose']];
    for (const [d, frag] of cases) { const r = await post(t.base, '/api/rsvp', d); assert.equal(r.status, 422); assert.match((await r.json()).error, new RegExp(frag, 'i')); }
    assert.equal(t.app.store.read('rsvps').length, 0);
    assert.equal((await post(t.base, '/api/rsvp', [1, 2])).status, 400);
  } finally { await t.close(); }
});

test('control characters are stripped and long fields truncated', async () => {
  const t = await boot(); try {
    await post(t.base, '/api/rsvp', { ...good, name: 'Am\u0000in\na', needs: 'x'.repeat(500) });
    const r = t.app.store.read('rsvps')[0]; assert.equal(r.name, 'Am in a'); assert.equal(r.needs.length, 200);
  } finally { await t.close(); }
});

test('honeypot returns success but stores nothing', async () => {
  const t = await boot(); try {
    const r = await post(t.base, '/api/rsvp', { ...good, website: 'http://spam' }); assert.equal(r.status, 200);
    assert.equal(t.app.store.read('rsvps').length, 0); assert.equal(t.app.store.read('consents').length, 0);
  } finally { await t.close(); }
});

test('full and past gatherings are refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-ev-')), ef = path.join(dir, 'events.json');
  fs.writeFileSync(ef, JSON.stringify([{ id: 'tiny', title: 'Tiny', date: '2026-11-14', time: '19:00', cap: 1 }, { id: 'old', title: 'Old', date: '2026-01-01', time: '19:00', cap: 5 }]));
  const t = await boot({ eventsFile: ef }); try {
    assert.equal((await post(t.base, '/api/rsvp', { ...good, event: 'tiny' })).status, 201);
    const full = await post(t.base, '/api/rsvp', { ...good, event: 'tiny', phone: '0722 000 111' }); assert.equal(full.status, 409); assert.match((await full.json()).error, /full/i);
    const old = await post(t.base, '/api/rsvp', { ...good, event: 'old' }); assert.equal(old.status, 422); assert.match((await old.json()).error, /passed/i);
  } finally { await t.close(); }
});

test('rate limiting returns 429', async () => {
  const t = await boot({ rateLimit: 3 }); try {
    const codes = []; for (let i = 0; i < 5; i++) codes.push((await post(t.base, '/api/stop', { phone: '0712345678' })).status);
    assert.deepEqual(codes, [200, 200, 200, 429, 429]);
  } finally { await t.close(); }
});

test('request body rules: size, type, JSON', async () => {
  const t = await boot(); try {
    assert.equal((await post(t.base, '/api/rsvp', { ...good, needs: 'y'.repeat(20000) })).status, 413);
    assert.equal((await fetch(t.base + '/api/rsvp', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415);
    assert.equal((await fetch(t.base + '/api/rsvp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' })).status, 400);
  } finally { await t.close(); }
});

test('STOP withdraws consent and never reveals whether a number exists', async () => {
  const t = await boot(); try {
    await post(t.base, '/api/rsvp', { ...good, future: true });
    const known = await post(t.base, '/api/stop', { phone: '0712345678' }), unknown = await post(t.base, '/api/stop', { phone: '0799999999' });
    assert.equal(known.status, 200); assert.deepEqual(await known.json(), await unknown.json());
    const last = t.app.store.read('consents').filter(c => c.phone === '+254712345678'); assert.equal(last.at(-1).action, 'withdraw'); assert.equal(last.at(-2).action, 'withdraw');
    assert.equal(t.app.store.read('consents').filter(c => c.phone === '+254799999999').length, 2);
  } finally { await t.close(); }
});

test('enquiries are validated and stored', async () => {
  const t = await boot(); try {
    assert.equal((await post(t.base, '/api/enquiry', { kind: 'space', name: 'Ola', contact: 'ola@example.org', message: 'Hello', org: 'Tower' })).status, 201);
    assert.equal((await post(t.base, '/api/enquiry', { kind: 'bogus', name: 'x', contact: 'y', message: 'z' })).status, 422);
    assert.equal(t.app.store.read('enquiries').length, 1);
  } finally { await t.close(); }
});

test('admin endpoints require the token', async () => {
  const t = await boot(); try {
    assert.equal((await fetch(t.base + '/api/admin/summary')).status, 401);
    assert.equal((await fetch(t.base + '/api/admin/summary', { headers: { authorization: 'Bearer wrong-token' } })).status, 401);
    assert.equal((await fetch(t.base + '/api/admin/summary', { headers: admin })).status, 200);
  } finally { await t.close(); }
  const off = await boot({ adminToken: '' }); try { assert.equal((await fetch(off.base + '/api/admin/summary', { headers: admin })).status, 503); } finally { await off.close(); }
});

test('CSV export neutralises spreadsheet formulas', async () => {
  const t = await boot(); try {
    await post(t.base, '/api/rsvp', { ...good, name: '=HYPERLINK("http://evil")', remind: true, future: true });
    const csv = await (await fetch(t.base + '/api/admin/rsvps.csv', { headers: admin })).text();
    assert.match(csv, /^id,ts,event,name,phone,needs,reminders,future/); assert.ok(csv.includes(`"'=HYPERLINK(""http://evil"")"`)); assert.ok(csv.includes('grant,grant')); assert.ok(csv.includes(',+254712345678,'), 'phone numbers stay readable');
  } finally { await t.close(); }
});

test('subject access and erasure', async () => {
  const t = await boot(); try {
    await post(t.base, '/api/rsvp', good);
    const s = await (await fetch(t.base + '/api/admin/subject?phone=0712345678', { headers: admin })).json();
    assert.equal(s.rsvps.length, 1); assert.equal(s.consents.length, 2);
    assert.equal((await fetch(t.base + '/api/admin/subject?phone=bad', { headers: admin })).status, 400);
    const d = await (await fetch(t.base + '/api/admin/subject?phone=0712345678', { method: 'DELETE', headers: admin })).json(); assert.equal(d.removed, 3);
    assert.equal(t.app.store.read('rsvps').length, 0); assert.equal(t.app.store.read('consents').length, 0);
    const er = t.app.store.read('erasures'); assert.equal(er.length, 1); assert.ok(!JSON.stringify(er).includes('712345678'));
  } finally { await t.close(); }
});

test('retention purge: removes old data, keeps opted-in contacts without their notes', async () => {
  const t = await boot(); try {
    await post(t.base, '/api/rsvp', { ...good, phone: '0711 111 111', needs: 'vegetarian', future: true });
    await post(t.base, '/api/rsvp', { ...good, phone: '0722 222 222', needs: 'step-free', future: false });
    t.setNow(Date.parse('2026-12-01T10:00:00Z')); let r = await (await fetch(t.base + '/api/admin/purge', { method: 'POST', headers: admin })).json();
    assert.deepEqual(r, { removed: 0, stripped: 0 }); assert.equal(t.app.store.read('rsvps').length, 2);
    t.setNow(Date.parse('2027-03-01T10:00:00Z')); r = await (await fetch(t.base + '/api/admin/purge', { method: 'POST', headers: admin })).json();
    assert.deepEqual(r, { removed: 1, stripped: 1 });
    const rs = t.app.store.read('rsvps'); assert.equal(rs.length, 1); assert.equal(rs[0].phone, '+254711111111'); assert.equal(rs[0].needs, '');
    assert.ok(t.app.store.read('consents').every(c => c.phone === '+254711111111'));
  } finally { await t.close(); }
});

test('static files: types, security headers, 404 page, extensionless URLs', async () => {
  const t = await boot(); try {
    const home = await fetch(t.base + '/'); assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match(home.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('referrer-policy'), 'no-referrer'); assert.equal(home.headers.get('set-cookie'), null);
    assert.equal((await fetch(t.base + '/join')).status, 200);
    assert.match((await fetch(t.base + '/assets/style.css')).headers.get('content-type'), /text\/css/);
    assert.equal((await fetch(t.base + '/assets/fonts/DMSans-var-latin.woff2')).headers.get('content-type'), 'font/woff2');
    const nf = await fetch(t.base + '/nope'); assert.equal(nf.status, 404); assert.match(await nf.text(), /Lost in the dark/);
    assert.equal((await fetch(t.base + '/', { method: 'POST' })).status, 405);
  } finally { await t.close(); }
});

test('path traversal cannot read files outside public/', async () => {
  const t = await boot(); try {
    for (const p of ['/..%2fserver%2fapp.js', '/%2e%2e/server/app.js', '/assets/..%2f..%2fpackage.json', '/..%5cserver%5capp.js', '/%00', '/data/events.json']) {
      const r = await raw(t.base, p); assert.ok(r.status === 404 || r.status === 400, p + ' -> ' + r.status); assert.ok(!r.body.includes('createApp') && !r.body.includes('"scripts"') && !r.body.includes('supper-walk'), p);
    }
  } finally { await t.close(); }
});

test('unknown API routes 404 and GET on write routes is not allowed', async () => {
  const t = await boot(); try {
    assert.equal((await fetch(t.base + '/api/nothing')).status, 404); assert.equal((await fetch(t.base + '/api/rsvp')).status, 404);
  } finally { await t.close(); }
});
