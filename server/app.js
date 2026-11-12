'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('./store');

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const NOTICE = '2026-10';

function normPhone(s) {
  if (typeof s !== 'string') return null;
  let d = s.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('254')) d = d.slice(3); else if (d.startsWith('0')) d = d.slice(1); else return null;
  return /^[17]\d{8}$/.test(d) ? '+254' + d : null;
}
const clean = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';
const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{6,15}$/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

function createApp(opts = {}) {
  const cfg = {
    publicDir: opts.publicDir || path.join(__dirname, '..', 'public'),
    dataDir: opts.dataDir || path.join(__dirname, '..', 'data'),
    eventsFile: opts.eventsFile || path.join(__dirname, '..', 'data', 'events.json'),
    adminToken: opts.adminToken ?? process.env.ADMIN_TOKEN ?? '',
    retentionDays: Number(opts.retentionDays ?? process.env.RETENTION_DAYS ?? 90),
    rateLimit: Number(opts.rateLimit ?? process.env.RATE_LIMIT ?? 10),
    trustProxy: opts.trustProxy ?? process.env.TRUST_PROXY === '1',
    now: opts.now || (() => Date.now()),
    salt: opts.salt || process.env.HASH_SALT || 'dev-salt-change-me',
    log: opts.log ?? (process.env.NODE_ENV !== 'test'),
  };
  const store = new Store(cfg.dataDir);
  const hits = new Map();
  const events = () => JSON.parse(fs.readFileSync(cfg.eventsFile, 'utf8'));

  function limited(ip) {
    const t = cfg.now(), w = (hits.get(ip) || []).filter(x => t - x < 60000);
    w.push(t); hits.set(ip, w); return w.length > cfg.rateLimit;
  }
  const send = (res, code, body, type = 'application/json', extra = {}) => {
    res.writeHead(code, { 'content-type': type, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'content-security-policy': CSP, 'cross-origin-opener-policy': 'same-origin', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  function body(req) {
    return new Promise((ok, no) => {
      if (!(req.headers['content-type'] || '').startsWith('application/json')) return no({ code: 415, msg: 'Send JSON.' });
      let n = 0; const ch = [];
      let big = false;
      req.on('data', c => { n += c.length; if (big) return; if (n > 10240) { big = true; no({ code: 413, msg: 'Too large.' }); } else ch.push(c); });
      req.on('end', () => { try { ok(JSON.parse(Buffer.concat(ch).toString() || '{}')); } catch { no({ code: 400, msg: 'Invalid JSON.' }); } });
      req.on('error', () => no({ code: 400, msg: 'Bad request.' }));
    });
  }
  const isAdmin = req => {
    if (!cfg.adminToken) return null;
    const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const a = Buffer.from(t), b = Buffer.from(cfg.adminToken);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const spots = e => e.cap - new Set(store.read('rsvps').filter(r => r.event === e.id).map(r => r.phone)).size;
  const consent = (phone, purpose, action) => store.append('consents', { id: store.id(), ts: new Date(cfg.now()).toISOString(), phone, purpose, action, notice: NOTICE, source: 'web' });
  const eventEnd = e => Date.parse(e.date + 'T23:59:59+03:00');

  function purge() {
    const cutoff = cfg.now() - cfg.retentionDays * 86400000, ev = Object.fromEntries(events().map(e => [e.id, e]));
    const rs = store.read('rsvps'), cs = store.read('consents');
    const future = new Set(); const last = {};
    cs.forEach(c => { if (c.purpose === 'future-gatherings') last[c.phone] = c.action; });
    Object.entries(last).forEach(([p, a]) => { if (a === 'grant') future.add(p); });
    const old = r => !ev[r.event] || eventEnd(ev[r.event]) < cutoff;
    let removed = 0, stripped = 0;
    const keep = [];
    rs.forEach(r => { if (!old(r)) keep.push(r); else if (future.has(r.phone)) { if (r.needs) { r.needs = ''; stripped++; } keep.push(r); } else removed++; });
    const live = new Set(keep.map(r => r.phone));
    store.write('rsvps', keep); store.write('consents', cs.filter(c => live.has(c.phone)));
    return { removed, stripped };
  }
  function subject(phone) {
    return { phone, rsvps: store.read('rsvps').filter(r => r.phone === phone), consents: store.read('consents').filter(c => c.phone === phone), enquiries: store.read('enquiries').filter(q => q.contact === phone) };
  }
  function erase(phone) {
    const s = subject(phone);
    store.write('rsvps', store.read('rsvps').filter(r => r.phone !== phone));
    store.write('consents', store.read('consents').filter(c => c.phone !== phone));
    store.write('enquiries', store.read('enquiries').filter(q => q.contact !== phone));
    store.append('erasures', { ts: new Date(cfg.now()).toISOString(), subject: store.hash(phone, cfg.salt), counts: { rsvps: s.rsvps.length, consents: s.consents.length, enquiries: s.enquiries.length } });
    return { removed: s.rsvps.length + s.consents.length + s.enquiries.length };
  }

  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/health' && m === 'GET') return send(res, 200, { ok: true });
    if (p === '/api/events' && m === 'GET') return send(res, 200, events().map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, spots: Math.max(0, spots(e)) })));
    if (p === '/api/translate' && m === 'GET') {
      const lang = clean(url.searchParams.get('lang'), 10) || 'sw';
      const targetPath = clean(url.searchParams.get('path'), 200) || '/';
      const norm = targetPath.startsWith('/') ? targetPath : '/' + targetPath;
      const target = 'https://kandelakulture.example' + (norm === '/index.html' ? '/' : norm);
      const redirectUrl = 'https://translate.google.com/translate?sl=auto&tl=' + encodeURIComponent(lang) + '&u=' + encodeURIComponent(target);
      res.writeHead(302, { 'location': redirectUrl, 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
      return res.end();
    }
    if (p.startsWith('/api/admin/')) {
      const a = isAdmin(req);
      if (a === null) return send(res, 503, { error: 'Admin is disabled.' });
      if (!a) return send(res, 401, { error: 'Unauthorised.' }, 'application/json', { 'www-authenticate': 'Bearer' });
      if (p === '/api/admin/summary' && m === 'GET') {
        const rs = store.read('rsvps'), cs = store.read('consents');
        return send(res, 200, { rsvps: rs.length, people: new Set(rs.map(r => r.phone)).size, byEvent: Object.fromEntries(events().map(e => [e.id, rs.filter(r => r.event === e.id).length])), enquiries: store.read('enquiries').length, withdrawals: cs.filter(c => c.action === 'withdraw').length });
      }
      if (p === '/api/admin/rsvps.csv' && m === 'GET') {
        const cs = store.read('consents'), st = (ph, pu) => { const l = cs.filter(c => c.phone === ph && c.purpose === pu).pop(); return l ? l.action : ''; };
        const rows = [['id', 'ts', 'event', 'name', 'phone', 'needs', 'reminders', 'future']].concat(store.read('rsvps').map(r => [r.id, r.ts, r.event, r.name, r.phone, r.needs, st(r.phone, 'event-reminders'), st(r.phone, 'future-gatherings')]));
        return send(res, 200, rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n', 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="rsvps.csv"' });
      }
      if (p === '/api/admin/subject') {
        const ph = normPhone(url.searchParams.get('phone') || ''); if (!ph) return send(res, 400, { error: 'Invalid phone.' });
        if (m === 'GET') return send(res, 200, subject(ph));
        if (m === 'DELETE') return send(res, 200, erase(ph));
      }
      if (p === '/api/admin/purge' && m === 'POST') return send(res, 200, purge());
      return send(res, 404, { error: 'Not found.' });
    }
    if (m !== 'POST') return send(res, 404, { error: 'Not found.' });
    if (limited(cfg.trustProxy ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x' : req.socket.remoteAddress)) return send(res, 429, { error: 'Too many requests. Try again in a minute.' }, 'application/json', { 'retry-after': '60' });
    let d; try { d = await body(req); } catch (e) { return send(res, e.code || 400, { error: e.msg || 'Bad request.' }, 'application/json', { connection: 'close' }); }
    if (typeof d !== 'object' || !d || Array.isArray(d)) return send(res, 400, { error: 'Invalid body.' });
    if (clean(d.website, 50)) return send(res, 200, { ok: true });          // honeypot: pretend success, store nothing
    const ts = new Date(cfg.now()).toISOString();
    if (p === '/api/rsvp') {
      const name = clean(d.name, 60), phone = normPhone(d.phone), needs = clean(d.needs, 200), ev = events().find(e => e.id === d.event);
      if (!name) return send(res, 422, { error: 'Please add your first name.' });
      if (!phone) return send(res, 422, { error: 'Please use a Kenyan mobile number, like 0712 345 678.' });
      if (d.age18 !== true) return send(res, 422, { error: 'Gatherings are for people aged 18 and over.' });
      if (!ev) return send(res, 422, { error: 'Please choose a gathering.' });
      if (eventEnd(ev) < cfg.now()) return send(res, 422, { error: 'That gathering has passed.' });
      const mine = store.read('rsvps').find(r => r.event === ev.id && r.phone === phone);
      if (mine) return send(res, 200, { ok: true, already: true, id: mine.id });
      if (spots(ev) <= 0) return send(res, 409, { error: 'This gathering is full. Message us on WhatsApp to join the waiting list.' });
      const rec = { id: store.id(), ts, event: ev.id, name, phone, needs, age18: true };
      store.append('rsvps', rec);
      consent(phone, 'event-reminders', d.remind === true ? 'grant' : 'decline');
      consent(phone, 'future-gatherings', d.future === true ? 'grant' : 'decline');
      return send(res, 201, { ok: true, id: rec.id });
    }
    if (p === '/api/stop') {
      const phone = normPhone(d.phone); if (phone) ['event-reminders', 'future-gatherings'].forEach(x => consent(phone, x, 'withdraw'));
      return send(res, 200, { ok: true });                                      // never reveal whether a number exists
    }
    if (p === '/api/enquiry') {
      const kind = ['studio', 'space', 'organisation', 'funder', 'creative', 'other'].includes(d.kind) ? d.kind : null;
      const name = clean(d.name, 60), contact = clean(d.contact, 100), message = clean(d.message, 1000), org = clean(d.org, 100);
      if (!kind || !name || !contact || !message) return send(res, 422, { error: 'Please complete the form.' });
      const ph = normPhone(contact); const rec = { id: store.id(), ts, kind, name, org, contact: ph || contact, message };
      store.append('enquiries', rec); return send(res, 201, { ok: true, id: rec.id });
    }
    return send(res, 404, { error: 'Not found.' });
  }

  function serve(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain', { allow: 'GET, HEAD' });
    let rel; try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request', 'text/plain'); }
    if (rel.includes('\0')) return send(res, 400, 'Bad request', 'text/plain');
    if (rel.endsWith('/')) rel += 'index.html';
    const root = path.resolve(cfg.publicDir); let file = path.resolve(root, '.' + path.sep + rel);
    if (file !== root && !file.startsWith(root + path.sep)) return send(res, 404, 'Not found', 'text/plain');
    const ok = f => { try { return fs.statSync(f).isFile(); } catch { return false; } };
    if (!ok(file) && ok(file + '.html')) file += '.html';
    if (!ok(file)) { const proto = path.resolve(__dirname, '..', 'prototypes', '.' + path.sep + rel); if (ok(proto)) file = proto; }
    if (!ok(file)) { const nf = path.join(root, '404.html'); return send(res, 404, ok(nf) ? fs.readFileSync(nf) : 'Not found', ok(nf) ? MIME['.html'] : 'text/plain'); }
    const ext = path.extname(file), cache = ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache';
    send(res, 200, req.method === 'HEAD' ? '' : fs.readFileSync(file), MIME[ext] || 'application/octet-stream', { 'cache-control': cache });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    res.on('finish', () => { if (cfg.log) console.log(req.method, url.pathname, res.statusCode); });
    try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else serve(req, res, url); }
    catch (e) { if (cfg.log) console.error(e.message); if (!res.headersSent) send(res, 500, { error: 'Something went wrong.' }); }
  });
  return { server, purge, store, cfg };
}
module.exports = { createApp, normPhone };
