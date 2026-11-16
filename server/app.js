'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store');
const { createWhatsApp } = require('./wa-api');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const NOTICE = '2026-10';
const DAY = 86400000;
const POST_ROUTES = new Set(['/api/rsvp', '/api/stop', '/api/enquiry', '/api/wa-click']);

// ---------- helpers ----------
function normPhone(s) {
  if (typeof s !== 'string') return null;
  let d = s.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('254')) { d = d.slice(3); if (d.startsWith('0')) d = d.slice(1); }   // tolerate "+254 0712…"
  else if (d.startsWith('0')) d = d.slice(1);
  else return null;
  return /^[17]\d{8}$/.test(d) ? '+254' + d : null;
}
const clean = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
// CSV cell: neutralise spreadsheet formulas (but keep +254… phones intact) and quote when needed.
const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{6,15}$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v))) ? d : Number(v);
const sha = s => crypto.createHash('sha256').update(s).digest();

function createApp(opts = {}) {
  const env = process.env;
  const salt = opts.salt || env.HASH_SALT || '';
  if (!salt && env.NODE_ENV === 'production') throw new Error('HASH_SALT must be set in production.');
  const wo = (k, e, d = '') => opts[k] ?? env[e] ?? d;
  const waMode = wo('waMode', 'WA_MODE', 'auto');
  const cfg = {
    publicDir: opts.publicDir || path.join(__dirname, '..', 'public'),
    dataDir: opts.dataDir || path.join(__dirname, '..', 'data'),
    eventsFile: opts.eventsFile || path.join(__dirname, '..', 'data', 'events.json'),
    adminToken: opts.adminToken ?? env.ADMIN_TOKEN ?? '',
    retentionDays: num(opts.retentionDays ?? env.RETENTION_DAYS, 90),
    enquiryRetentionDays: num(opts.enquiryRetentionDays ?? env.ENQUIRY_RETENTION_DAYS, 0),   // 0 = keep enquiries
    rateLimit: num(opts.rateLimit ?? env.RATE_LIMIT, 10),
    trustProxy: opts.trustProxy ?? env.TRUST_PROXY === '1',
    now: opts.now || (() => Date.now()),
    salt: salt || 'dev-salt-change-me',
    siteOrigin: String(opts.siteOrigin || env.SITE_ORIGIN || 'https://kandelakulture.example').replace(/\/+$/, ''),
    servePrototypes: opts.servePrototypes ?? env.NODE_ENV !== 'production',
    log: opts.log ?? (env.NODE_ENV !== 'test'),
    // WhatsApp: off | link (free links only) | api (Cloud API handling always on) | auto (api handling switches on at the volume threshold)
    wa: {
      mode: ['off', 'link', 'api', 'auto'].includes(waMode) ? waMode : 'auto',
      threshold: num(wo('waThreshold', 'WA_API_THRESHOLD', undefined), 150),   // site-started chats in 30 days
      verifyToken: wo('waVerifyToken', 'WA_VERIFY_TOKEN'), appSecret: wo('waAppSecret', 'WA_APP_SECRET'),
      token: wo('waAccessToken', 'WA_ACCESS_TOKEN'), phoneId: wo('waPhoneId', 'WA_PHONE_NUMBER_ID'),
      graphVersion: wo('waGraphVersion', 'WA_GRAPH_VERSION', 'v23.0'),
    },
  };
  const store = new Store(cfg.dataDir);
  const tokenHash = cfg.adminToken ? sha(cfg.adminToken) : null;

  // ---------- events (cached until the file changes, validated on load) ----------
  let evCache = { m: -1, s: -1, list: [] };
  const eventEnd = e => Date.parse(e.date + 'T23:59:59+03:00');
  function events() {
    const st = fs.statSync(cfg.eventsFile);
    if (st.mtimeMs !== evCache.m || st.size !== evCache.s) {
      const list = JSON.parse(fs.readFileSync(cfg.eventsFile, 'utf8'));
      if (!Array.isArray(list)) throw new Error('events file must be an array');
      list.forEach((e, i) => {
        if (!e || typeof e.id !== 'string' || !Number.isInteger(e.cap) || !Number.isFinite(eventEnd(e))) throw new Error(`event #${i} needs a string id, integer cap and YYYY-MM-DD date`);
      });
      evCache = { m: st.mtimeMs, s: st.size, list };
    }
    return evCache.list;
  }

  // ---------- rate limiting ----------
  function makeLimiter(limit) {
    const hits = new Map();
    return key => {
      const t = cfg.now(), w = (hits.get(key) || []).filter(x => t - x < 60000);
      const over = w.length >= limit;
      if (!over) w.push(t);
      if (w.length) hits.set(key, w); else hits.delete(key);
      if (hits.size > 10000) for (const [k, v] of hits) if (t - v[v.length - 1] >= 60000) hits.delete(k);   // bound memory
      return over;
    };
  }
  const postLimited = makeLimiter(cfg.rateLimit), adminLimited = makeLimiter(60);
  // With TRUST_PROXY=1 we trust exactly one proxy in front: its hop is the LAST x-forwarded-for entry (earlier ones are client-controlled).
  const clientIp = req => {
    if (cfg.trustProxy) {
      const xs = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
      if (xs.length) return xs[xs.length - 1];
    }
    return req.socket.remoteAddress || 'unknown';
  };

  // ---------- responses ----------
  const SEC = {
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': CSP, 'cross-origin-opener-policy': 'same-origin',
    ...(cfg.trustProxy ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
  const send = (res, code, body, type = 'application/json', extra = {}) => {
    const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(code, { 'content-type': type, 'content-length': Buffer.byteLength(payload), 'cache-control': 'no-store', ...SEC, ...extra });
    res.end(payload);
  };
  function body(req) {
    return new Promise((ok, no) => {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return no({ code: 415, msg: 'Send JSON.' });
      if (Number(req.headers['content-length']) > 10240) return no({ code: 413, msg: 'Too large.' });
      let n = 0, big = false; const ch = [];
      req.on('data', c => { n += c.length; if (big) return; if (n > 10240) { big = true; no({ code: 413, msg: 'Too large.' }); } else ch.push(c); });
      req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { no({ code: 400, msg: 'Invalid JSON.' }); } });
      req.on('error', () => no({ code: 400, msg: 'Bad request.' }));
    });
  }
  // Raw bytes are needed to check the webhook signature.
  function rawBody(req, max) {
    return new Promise((ok, no) => {
      if (Number(req.headers['content-length']) > max) return no({ code: 413, msg: 'Too large.' });
      let n = 0, big = false; const ch = [];
      req.on('data', c => { n += c.length; if (big) return; if (n > max) { big = true; no({ code: 413, msg: 'Too large.' }); } else ch.push(c); });
      req.on('end', () => ok(Buffer.concat(ch)));
      req.on('error', () => no({ code: 400, msg: 'Bad request.' }));
    });
  }
  // null = admin disabled, false = bad token, true = ok. Both sides are hashed so length is not leaked.
  const isAdmin = req => {
    if (!tokenHash) return null;
    const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '';
    return crypto.timingSafeEqual(sha(t), tokenHash);
  };

  // ---------- data helpers ----------
  const counts = rs => { const m = new Map(); for (const r of rs) { let s = m.get(r.event); if (!s) m.set(r.event, s = new Set()); s.add(r.phone); } return m; };
  const left = (e, m) => e.cap - (m.get(e.id)?.size || 0);
  const consent = (phone, purpose, action, source = 'web') => store.append('consents', { id: store.id(), ts: new Date(cfg.now()).toISOString(), phone, purpose, action, notice: NOTICE, source });
  const consentState = () => { const m = new Map(); for (const c of store.read('consents')) m.set(c.phone + '|' + c.purpose, c.action); return m; };

  // One RSVP path for the web form and the WhatsApp handler. Returns { code, error?, id?, already?, ev?, phone? }.
  function registerRsvp(d, source = 'web') {
    const name = clean(d.name, 60), phone = normPhone(d.phone), needs = clean(d.needs, 200), ev = events().find(e => e.id === d.event);
    if (!name) return { code: 422, error: 'Please add your first name.' };
    if (!phone) return { code: 422, error: 'Please use a Kenyan mobile number, like 0712 345 678.' };
    if (d.age18 !== true) return { code: 422, error: 'Gatherings are for people aged 18 and over.' };
    if (!ev) return { code: 422, error: 'Please choose a gathering.' };
    if (eventEnd(ev) < cfg.now()) return { code: 422, error: 'That gathering has passed.' };
    const rs = store.read('rsvps');
    // Already registered: answer exactly like a new sign-up so the web form can't be used to probe who has RSVPed.
    if (rs.some(r => r.event === ev.id && r.phone === phone)) return { code: 201, id: store.id(), already: true, ev, phone };
    if (left(ev, counts(rs)) <= 0) return { code: 409, error: 'This gathering is full. Message us on WhatsApp to join the waiting list.', ev, phone };
    const rec = { id: store.id(), ts: new Date(cfg.now()).toISOString(), event: ev.id, name, phone, needs, age18: true, source };
    store.append('rsvps', rec);
    consent(phone, 'event-reminders', d.remind === true ? 'grant' : 'decline', source);
    consent(phone, 'future-gatherings', d.future === true ? 'grant' : 'decline', source);
    return { code: 201, id: rec.id, ev, phone };
  }
  const wa = createWhatsApp({ store, cfg, events, normPhone, registerRsvp, consent, consentState, makeLimiter, clean, fetch: opts.fetch });

  function purge() {
    const now = cfg.now(), cutoff = now - cfg.retentionDays * DAY;
    const ev = new Map(events().map(e => [e.id, e])), st = consentState();
    const future = p => st.get(p + '|future-gatherings') === 'grant';
    const old = r => { const e = ev.get(r.event); return !e || eventEnd(e) < cutoff; };
    let removed = 0, stripped = 0; const keep = [];
    for (const r of store.read('rsvps')) {
      if (!old(r)) keep.push(r);
      else if (future(r.phone)) { if (r.needs) { r.needs = ''; stripped++; } keep.push(r); }   // keep contact, drop access needs
      else removed++;
    }
    const live = new Set(keep.map(r => r.phone));
    store.write('rsvps', keep);
    store.write('consents', store.read('consents').filter(c => live.has(c.phone)));
    let enquiriesRemoved = 0;
    if (cfg.enquiryRetentionDays > 0) {
      const ecut = now - cfg.enquiryRetentionDays * DAY, qs = store.read('enquiries'), kq = qs.filter(q => Date.parse(q.ts) >= ecut);
      enquiriesRemoved = qs.length - kq.length;
      if (enquiriesRemoved) store.write('enquiries', kq);
    }
    const wl = store.read('waitlist'), kw = wl.filter(x => { const e = ev.get(x.event); return e && eventEnd(e) >= cutoff; });
    const waitlistRemoved = wl.length - kw.length;
    if (waitlistRemoved) store.write('waitlist', kw);
    wa.prune();
    return { removed, stripped, enquiriesRemoved, waitlistRemoved };
  }
  const subject = phone => ({ phone, rsvps: store.read('rsvps').filter(r => r.phone === phone), consents: store.read('consents').filter(c => c.phone === phone), enquiries: store.read('enquiries').filter(q => q.contact === phone), waitlist: store.read('waitlist').filter(x => x.phone === phone) });
  function erase(phone) {
    const s = subject(phone);
    for (const n of ['rsvps', 'consents', 'waitlist']) store.write(n, store.read(n).filter(r => r.phone !== phone));
    store.write('enquiries', store.read('enquiries').filter(q => q.contact !== phone));
    store.append('erasures', { ts: new Date(cfg.now()).toISOString(), subject: store.hash(phone, cfg.salt), counts: { rsvps: s.rsvps.length, consents: s.consents.length, enquiries: s.enquiries.length, waitlist: s.waitlist.length } });
    return { removed: s.rsvps.length + s.consents.length + s.enquiries.length + s.waitlist.length };
  }

  // ---------- API ----------
  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true });
    if (p === '/api/events' && m === 'GET') {
      const c = counts(store.read('rsvps'));
      return send(res, 200, events().map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, spots: Math.max(0, left(e, c)) })));
    }
    if (p === '/api/translate' && m === 'GET') {
      const l = clean(url.searchParams.get('lang'), 10);
      const lang = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/.test(l) ? l : 'sw';
      const tp = clean(url.searchParams.get('path'), 200) || '/';
      const norm = tp.startsWith('/') ? tp : '/' + tp;
      const target = cfg.siteOrigin + (norm === '/index.html' ? '/' : norm);     // host is fixed: never an open redirect
      return send(res, 302, '', 'text/plain', { location: 'https://translate.google.com/translate?sl=auto&tl=' + encodeURIComponent(lang) + '&u=' + encodeURIComponent(target) });
    }
    if (p === '/api/wa/webhook') {                                // Meta calls this: no browser, no CORS, no per-IP limit
      if (cfg.wa.mode === 'off') return send(res, 404, { error: 'Not found.' });
      if (m === 'GET') { const c = wa.verify(url.searchParams); return c === null ? send(res, 403, 'Forbidden', 'text/plain') : send(res, 200, c, 'text/plain'); }
      if (m === 'POST') {
        let raw; try { raw = await rawBody(req, 65536); } catch (e) { return send(res, e.code || 400, { error: e.msg || 'Bad request.' }, 'application/json', { connection: 'close' }); }
        const out = wa.handle(raw, req.headers['x-hub-signature-256']);
        out.done.catch(() => {});                                 // replies finish in the background
        return send(res, out.status, { ok: out.status === 200 });
      }
      return send(res, 405, { error: 'Method not allowed.' }, 'application/json', { allow: 'GET, POST' });
    }
    if (p.startsWith('/api/admin/')) {
      if (adminLimited(clientIp(req))) return send(res, 429, { error: 'Too many requests.' }, 'application/json', { 'retry-after': '60' });
      const a = isAdmin(req);
      if (a === null) return send(res, 503, { error: 'Admin is disabled.' });
      if (!a) return send(res, 401, { error: 'Unauthorised.' }, 'application/json', { 'www-authenticate': 'Bearer' });
      if (p === '/api/admin/summary' && m === 'GET') {
        const rs = store.read('rsvps');
        const byEvent = Object.fromEntries(events().map(e => [e.id, 0]));
        for (const r of rs) if (r.event in byEvent) byEvent[r.event]++;
        return send(res, 200, { rsvps: rs.length, people: new Set(rs.map(r => r.phone)).size, byEvent, enquiries: store.read('enquiries').length, withdrawals: store.read('consents').filter(c => c.action === 'withdraw').length });
      }
      if (p === '/api/admin/rsvps.csv' && m === 'GET') {
        const st = consentState(), g = (ph, pu) => st.get(ph + '|' + pu) || '';
        const rows = [['id', 'ts', 'event', 'name', 'phone', 'needs', 'reminders', 'future']].concat(store.read('rsvps').map(r => [r.id, r.ts, r.event, r.name, r.phone, r.needs, g(r.phone, 'event-reminders'), g(r.phone, 'future-gatherings')]));
        return send(res, 200, rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n', 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="rsvps.csv"' });
      }
      if (p === '/api/admin/subject') {
        const ph = normPhone(url.searchParams.get('phone') || ''); if (!ph) return send(res, 400, { error: 'Invalid phone.' });
        if (m === 'GET') return send(res, 200, subject(ph));
        if (m === 'DELETE') return send(res, 200, erase(ph));
      }
      if (p === '/api/admin/wa-status' && m === 'GET') return send(res, 200, wa.status());
      if (p === '/api/admin/purge' && m === 'POST') return send(res, 200, purge());
      return send(res, 404, { error: 'Not found.' });
    }

    if (!POST_ROUTES.has(p)) return send(res, 404, { error: 'Not found.' });
    if (m !== 'POST') return send(res, 405, { error: 'Method not allowed.' }, 'application/json', { allow: 'POST' });
    if (postLimited(clientIp(req))) return send(res, 429, { error: 'Too many requests. Try again in a minute.' }, 'application/json', { 'retry-after': '60' });
    let d; try { d = await body(req); } catch (e) { return send(res, e.code || 400, { error: e.msg || 'Bad request.' }, 'application/json', { connection: 'close' }); }
    if (typeof d !== 'object' || !d || Array.isArray(d)) return send(res, 400, { error: 'Invalid body.' });
    if (clean(d.website, 50)) return send(res, 200, { ok: true });          // honeypot: pretend success, store nothing
    const ts = new Date(cfg.now()).toISOString();

    if (p === '/api/wa-click') {                                  // anonymous counter that feeds the volume trigger
      wa.click(clean(d.kind, 20));
      return send(res, 204, '');
    }
    if (p === '/api/rsvp') {
      const r = registerRsvp(d);
      if (r.error) return send(res, r.code, { error: r.error });
      return send(res, 201, { ok: true, id: r.id });
    }
    if (p === '/api/stop') {
      const phone = normPhone(d.phone);
      // Only record withdrawals for numbers we hold data on (stops arbitrary numbers filling the store); response is identical either way.
      if (phone && (store.read('rsvps').some(r => r.phone === phone) || store.read('consents').some(c => c.phone === phone))) {
        const st = consentState();
        for (const x of ['event-reminders', 'future-gatherings']) if (st.get(phone + '|' + x) !== 'withdraw') consent(phone, x, 'withdraw');
      }
      return send(res, 200, { ok: true });
    }
    if (p === '/api/enquiry') {
      const kind = ['studio', 'space', 'organisation', 'funder', 'creative', 'other'].includes(d.kind) ? d.kind : null;
      const name = clean(d.name, 60), contact = clean(d.contact, 100), message = clean(d.message, 1000), org = clean(d.org, 100);
      if (!kind || !name || !contact || !message) return send(res, 422, { error: 'Please complete the form.' });
      const rec = { id: store.id(), ts, kind, name, org, contact: normPhone(contact) || contact, message };
      store.append('enquiries', rec);
      return send(res, 201, { ok: true, id: rec.id });
    }
    return send(res, 404, { error: 'Not found.' });
  }

  // ---------- static files ----------
  const notFound = res => {
    try { return send(res, 404, fs.readFileSync(path.join(path.resolve(cfg.publicDir), '404.html')), MIME['.html']); }
    catch { return send(res, 404, 'Not found', 'text/plain'); }
  };
  function find(root, rel) {
    const f = path.resolve(root, '.' + path.sep + rel);
    if (!f.startsWith(root + path.sep)) return null;
    for (const c of [f, f + '.html']) { try { const st = fs.statSync(c); if (st.isFile()) return { file: c, st }; } catch { /* next */ } }
    return null;
  }
  function serve(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain', { allow: 'GET, HEAD' });
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request', 'text/plain'); }
    if (rel.includes('\0')) return send(res, 400, 'Bad request', 'text/plain');
    if (rel.endsWith('/')) rel += 'index.html';
    if (rel.split('/').some(s => s.startsWith('.') && s !== '.well-known')) return notFound(res);   // dotfiles and ".." segments
    const roots = [path.resolve(cfg.publicDir)];
    if (cfg.servePrototypes) roots.push(path.resolve(__dirname, '..', 'prototypes'));
    let hit = null; for (const r of roots) { hit = find(r, rel); if (hit) break; }
    if (!hit) return notFound(res);
    const ext = path.extname(hit.file), etag = `W/"${hit.st.size}-${Math.floor(hit.st.mtimeMs)}"`;
    const cache = ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { etag, 'cache-control': cache, ...SEC }); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'content-length': hit.st.size, 'cache-control': cache, etag, ...SEC });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(hit.file).on('error', () => res.destroy()).pipe(res);
  }

  // ---------- server ----------
  const server = http.createServer(async (req, res) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch { return send(res, 400, 'Bad request', 'text/plain'); }   // e.g. "//" would otherwise throw and crash the process
    res.on('finish', () => { if (cfg.log) console.log(req.method, url.pathname, res.statusCode); });
    try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else serve(req, res, url); }
    catch (e) { if (cfg.log) console.error(e.message); if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' }); else res.destroy(); }
  });
  server.headersTimeout = 10000; server.requestTimeout = 15000; server.keepAliveTimeout = 5000;
  return { server, purge, events, store, cfg, wa };
}
module.exports = { createApp, normPhone };
