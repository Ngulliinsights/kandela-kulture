'use strict';
// API layer for the Cloudflare Worker. Mirrors server/app.js route-for-route;
// storage is D1 (worker/src/store.mjs) instead of JSONL files.
import eventsJson from '../../data/events.json' with { type: 'json' };
import * as store from './store.mjs';
import { createWhatsApp } from './wa.mjs';
import { sendMail } from './mail.mjs';
import { DAY, NOTICE, normPhone, clean, csvCell, num, rid, sha256hex, hexEq } from './util.mjs';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
export const SEC = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': CSP,
  'cross-origin-opener-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};
const POST_ROUTES = new Set(['/api/rsvp', '/api/stop', '/api/enquiry', '/api/wa-click', '/api/cancel', '/api/role-interest']);

export function makeCfg(env) {
  const waMode = env.WA_MODE || 'auto';
  return {
    adminToken: env.ADMIN_TOKEN || '',
    retentionDays: num(env.RETENTION_DAYS, 90),
    enquiryRetentionDays: num(env.ENQUIRY_RETENTION_DAYS, 0),
    rateLimit: num(env.RATE_LIMIT, 10),
    siteOrigin: String(env.SITE_ORIGIN || 'https://kandelakulture.example').replace(/\/+$/, ''),
    salt: env.HASH_SALT || 'dev-salt-change-me',
    wa: {
      mode: ['off', 'link', 'api', 'auto'].includes(waMode) ? waMode : 'auto',
      threshold: num(env.WA_API_THRESHOLD, 150),
      verifyToken: env.WA_VERIFY_TOKEN || '', appSecret: env.WA_APP_SECRET || '',
      token: env.WA_ACCESS_TOKEN || '', phoneId: env.WA_PHONE_NUMBER_ID || '',
      graphVersion: env.WA_GRAPH_VERSION || 'v23.0',
    },
  };
}

// ---------- events (validated once per isolate) ----------
const eventEnd = e => Date.parse(e.date + 'T23:59:59+03:00');
let evList = null;
function events() {
  if (!evList) {
    const list = eventsJson;
    if (!Array.isArray(list)) throw new Error('events file must be an array');
    list.forEach((e, i) => {
      if (!e || typeof e.id !== 'string' || !Number.isInteger(e.cap) || !Number.isFinite(eventEnd(e))) throw new Error(`event #${i} needs a string id, integer cap and YYYY-MM-DD date`);
    });
    evList = list;
  }
  return evList;
}

// ---------- responses ----------
const json = (data, code = 200, extra = {}) =>
  new Response(typeof data === 'string' ? data : JSON.stringify(data), {
    status: code,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...SEC, ...extra },
  });
const text = (body, code, type, extra = {}) =>
  new Response(body, { status: code, headers: { 'content-type': type, 'cache-control': 'no-store', ...SEC, ...extra } });

async function jsonBody(req) {
  const ct = req.headers.get('content-type') || '';
  if (!ct.startsWith('application/json')) throw { code: 415, msg: 'Send JSON.' };
  if (Number(req.headers.get('content-length') || 0) > 10240) throw { code: 413, msg: 'Too large.' };
  const t = await req.text();
  if (t.length > 10240) throw { code: 413, msg: 'Too large.' };
  try { return JSON.parse(t || '{}'); } catch { throw { code: 400, msg: 'Invalid JSON.' }; }
}

// null = admin disabled, false = bad token, true = ok.
async function isAdmin(req, cfg, tokenHash) {
  if (!cfg.adminToken) return null;
  const h = req.headers.get('authorization') || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return hexEq(await sha256hex(t), tokenHash);
}

const clientIp = req => req.headers.get('cf-connecting-ip') || 'unknown';
const makeLimiter = (env, limit) => key => store.rateLimited(env, key, limit);

// ---------- data helpers ----------
const counts = rs => { const m = new Map(); for (const r of rs) { let s = m.get(r.event); if (!s) m.set(r.event, s = new Set()); s.add(r.phone); } return m; };
const left = (e, m) => e.cap - (m.get(e.id)?.size || 0);
const nowIso = () => new Date().toISOString();
const consent = (env, phone, purpose, action, source = 'web') =>
  store.append(env, 'consents', { id: rid(), ts: nowIso(), phone, purpose, action, notice: NOTICE, source });
const consentState = async env => { const m = new Map(); for (const c of await store.read(env, 'consents')) m.set(c.phone + '|' + c.purpose, c.action); return m; };

async function notifyAdmin(env, subject, text) {
  const to = env.ADMIN_EMAIL || env.MAIL_FROM;
  if (to) sendMail(env, to, subject, text).catch(() => {});
}

// One RSVP path for the web form and the WhatsApp handler.
// Returns { code, error?, id?, already?, ev?, phone? }.
async function registerRsvp(env, cfg, d, source = 'web') {
  const name = clean(d.name, 60), phone = normPhone(d.phone), needs = clean(d.needs, 200);
  const ev = events().find(e => e.id === d.event);
  if (!name) return { code: 422, error: 'Please add your first name.' };
  if (!phone) return { code: 422, error: 'Please use a Kenyan mobile number, like 0712 345 678.' };
  if (d.age18 !== true) return { code: 422, error: 'Gatherings are for people aged 18 and over.' };
  if (!ev) return { code: 422, error: 'Please choose a gathering.' };
  if (eventEnd(ev) < Date.now()) return { code: 422, error: 'That gathering has passed.' };
  const rs = await store.read(env, 'rsvps');
  // Already registered: answer exactly like a new sign-up so the web form can't probe who has RSVPed.
  if (rs.some(r => r.event === ev.id && r.phone === phone)) return { code: 201, id: rid(), already: true, ev, phone };
  if (left(ev, counts(rs)) <= 0) return { code: 409, error: 'This gathering is full. Message us on WhatsApp to join the waiting list.', ev, phone };
  const rec = { id: rid(), ts: nowIso(), event: ev.id, name, phone, needs, age18: true, source };
  // Claim (event, phone) atomically so two concurrent requests can't double-book.
  if (!(await store.claimRsvp(env, ev.id, phone))) {
    const rs2 = await store.read(env, 'rsvps');
    if (rs2.some(r => r.event === ev.id && r.phone === phone)) return { code: 201, id: rid(), already: true, ev, phone };
    await store.releaseRsvp(env, ev.id, phone);   // stale claim with no row: reclaim once
    if (!(await store.claimRsvp(env, ev.id, phone))) return { code: 409, error: 'Please try again in a moment.' };
  }
  await store.append(env, 'rsvps', rec);
  await consent(env, phone, 'event-reminders', d.remind === true ? 'grant' : 'decline', source);
  await consent(env, phone, 'future-gatherings', d.future === true ? 'grant' : 'decline', source);
  notifyAdmin(env,
    `New RSVP: ${name} for ${ev.title}`,
    `New RSVP received\n\nName: ${name}\nPhone: ${phone}\nEvent: ${ev.title}\nNeeds: ${needs || 'None'}\nSource: ${source}\nTime: ${rec.ts}`);
  return { code: 201, id: rec.id, ev, phone };
}

async function purge(env, cfg, wa) {
  const now = Date.now(), cutoff = now - cfg.retentionDays * DAY;
  const ev = new Map(events().map(e => [e.id, e])), st = await consentState(env);
  const future = p => st.get(p + '|future-gatherings') === 'grant';
  const old = r => { const e = ev.get(r.event); return !e || eventEnd(e) < cutoff; };
  let removed = 0, stripped = 0; const keep = [];
  for (const r of await store.read(env, 'rsvps')) {
    if (!old(r)) keep.push(r);
    else if (future(r.phone)) { if (r.needs) { r.needs = ''; stripped++; } keep.push(r); }
    else removed++;
  }
  const live = new Set(keep.map(r => r.phone));
  const map = {
    rsvps: keep,
    consents: (await store.read(env, 'consents')).filter(c => live.has(c.phone)),
  };
  let enquiriesRemoved = 0;
  if (cfg.enquiryRetentionDays > 0) {
    const ecut = now - cfg.enquiryRetentionDays * DAY, qs = await store.read(env, 'enquiries');
    const kq = qs.filter(q => Date.parse(q.ts) >= ecut);
    enquiriesRemoved = qs.length - kq.length;
    map.enquiries = kq;
  }
  const wl = await store.read(env, 'waitlist');
  const kw = wl.filter(x => { const e = ev.get(x.event); return e && eventEnd(e) >= cutoff; });
  const waitlistRemoved = wl.length - kw.length;
  if (waitlistRemoved) map.waitlist = kw;
  await store.writeAll(env, map);
  await wa.prune(env);
  await store.waStatsPrune(env, new Date(now - 90 * DAY).toISOString().slice(0, 10));
  await store.pruneRateHits(env);
  return { removed, stripped, enquiriesRemoved, waitlistRemoved };
}

// Cron entrypoint: build the same deps the API uses, then purge.
export async function runPurge(env) {
  const cfg = makeCfg(env);
  const wa = createWhatsApp({ env, cfg, events, normPhone, registerRsvp, consent, consentState, makeLimiter, clean });
  return purge(env, cfg, wa);
}

const subject = async (env, phone) => ({
  phone,
  rsvps: (await store.read(env, 'rsvps')).filter(r => r.phone === phone),
  consents: (await store.read(env, 'consents')).filter(c => c.phone === phone),
  enquiries: (await store.read(env, 'enquiries')).filter(q => q.contact === phone),
  waitlist: (await store.read(env, 'waitlist')).filter(x => x.phone === phone),
});

async function erase(env, cfg, phone) {
  const s = await subject(env, phone);
  await store.writeAll(env, {
    rsvps: (await store.read(env, 'rsvps')).filter(r => r.phone !== phone),
    consents: (await store.read(env, 'consents')).filter(c => c.phone !== phone),
    waitlist: (await store.read(env, 'waitlist')).filter(x => x.phone !== phone),
    enquiries: (await store.read(env, 'enquiries')).filter(q => q.contact !== phone),
  });
  await store.releaseRsvpsForPhone(env, phone);
  await store.append(env, 'erasures', {
    id: rid(), ts: nowIso(), subject: (await sha256hex(cfg.salt + phone)).slice(0, 16),
    counts: { rsvps: s.rsvps.length, consents: s.consents.length, enquiries: s.enquiries.length, waitlist: s.waitlist.length },
  });
  return { removed: s.rsvps.length + s.consents.length + s.enquiries.length + s.waitlist.length };
}

// ---------- API ----------
export async function api(req, env, url, ctx) {
  const cfg = makeCfg(env);
  const p = url.pathname, m = req.method;
  const wa = createWhatsApp({ env, cfg, events, registerRsvp, consent, consentState, makeLimiter, clean });

  if (p === '/api/health' && m === 'GET') return json({ ok: true });
  if (p === '/api/events' && m === 'GET') {
    const c = counts(await store.read(env, 'rsvps'));
    return json(events().map(e => ({ id: e.id, title: e.title, date: e.date, time: e.time, spots: Math.max(0, left(e, c)) })));
  }
  if (p === '/api/translate' && m === 'GET') {
    const l = clean(url.searchParams.get('lang'), 10);
    const lang = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?$/.test(l) ? l : 'sw';
    const tp = clean(url.searchParams.get('path'), 200) || '/';
    const norm = tp.startsWith('/') ? tp : '/' + tp;
    const target = cfg.siteOrigin + (norm === '/index.html' ? '/' : norm);
    return text('', 302, 'text/plain', { location: 'https://translate.google.com/translate?sl=auto&tl=' + encodeURIComponent(lang) + '&u=' + encodeURIComponent(target) });
  }
  if (p === '/api/wa/webhook') {
    if (cfg.wa.mode === 'off') return json({ error: 'Not found.' }, 404);
    if (m === 'GET') {
      const c = await wa.verify(url.searchParams);
      return c === null ? text('Forbidden', 403, 'text/plain') : text(c, 200, 'text/plain');
    }
    if (m === 'POST') {
      const raw = await req.text();
      if (raw.length > 65536) return json({ error: 'Too large.' }, 413);
      const out = await wa.handle(raw, req.headers.get('x-hub-signature-256'));
      if (ctx && out.done) ctx.waitUntil(out.done);   // replies finish in the background
      return json({ ok: out.status === 200 }, out.status);
    }
    return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
  }
  if (p.startsWith('/api/admin/')) {
    const ip = clientIp(req);
    if (await store.rateLimited(env, 'admin:' + ip, 60)) return json({ error: 'Too many requests.' }, 429, { 'retry-after': '60' });
    const a = await isAdmin(req, cfg, await sha256hex(cfg.adminToken));
    if (a === null) return json({ error: 'Admin is disabled.' }, 503);
    if (!a) return json({ error: 'Unauthorised.' }, 401, { 'www-authenticate': 'Bearer' });
    if (p === '/api/admin/summary' && m === 'GET') {
      const rs = await store.read(env, 'rsvps');
      const byEvent = Object.fromEntries(events().map(e => [e.id, 0]));
      for (const r of rs) if (r.event in byEvent) byEvent[r.event]++;
      return json({
        rsvps: rs.length, people: new Set(rs.map(r => r.phone)).size, byEvent,
        enquiries: (await store.read(env, 'enquiries')).length,
        withdrawals: (await store.read(env, 'consents')).filter(c => c.action === 'withdraw').length,
      });
    }
    if (p === '/api/admin/rsvps.csv' && m === 'GET') {
      const st = await consentState(env);
      const g = (ph, pu) => st.get(ph + '|' + pu) || '';
      const rows = [['id', 'ts', 'event', 'name', 'phone', 'needs', 'reminders', 'future']]
        .concat((await store.read(env, 'rsvps')).map(r => [r.id, r.ts, r.event, r.name, r.phone, r.needs, g(r.phone, 'event-reminders'), g(r.phone, 'future-gatherings')]));
      return text(rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n', 200, 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="rsvps.csv"' });
    }
    if (p === '/api/admin/subject') {
      const ph = normPhone(url.searchParams.get('phone') || '');
      if (!ph) return json({ error: 'Invalid phone.' }, 400);
      if (m === 'GET') return json(await subject(env, ph));
      if (m === 'DELETE') return json(await erase(env, cfg, ph));
    }
    if (p === '/api/admin/wa-status' && m === 'GET') return json(await wa.status(env));
    if (p === '/api/admin/purge' && m === 'POST') return json(await purge(env, cfg, wa));
    return json({ error: 'Not found.' }, 404);
  }

  if (!POST_ROUTES.has(p)) return json({ error: 'Not found.' }, 404);
  if (m !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (await store.rateLimited(env, 'post:' + clientIp(req), cfg.rateLimit))
    return json({ error: 'Too many requests. Try again in a minute.' }, 429, { 'retry-after': '60' });
  let d;
  try { d = await jsonBody(req); } catch (e) { return json({ error: e.msg || 'Bad request.' }, e.code || 400); }
  if (typeof d !== 'object' || !d || Array.isArray(d)) return json({ error: 'Invalid body.' }, 400);
  if (clean(d.website, 50)) return json({ ok: true });   // honeypot: pretend success, store nothing

  if (p === '/api/wa-click') {
    await wa.click(clean(d.kind, 20));
    return new Response('', { status: 204, headers: { 'cache-control': 'no-store', ...SEC } });
  }
  if (p === '/api/rsvp') {
    const r = await registerRsvp(env, cfg, d);
    if (r.error) return json({ error: r.error }, r.code);
    return json({ ok: true, id: r.id }, 201);
  }
  if (p === '/api/stop') {
    const phone = normPhone(d.phone);
    if (phone) {
      const rs = await store.read(env, 'rsvps'), cs = await store.read(env, 'consents');
      if (rs.some(r => r.phone === phone) || cs.some(c => c.phone === phone)) {
        const st = await consentState(env);
        for (const x of ['event-reminders', 'future-gatherings'])
          if (st.get(phone + '|' + x) !== 'withdraw') await consent(env, phone, x, 'withdraw');
      }
    }
    return json({ ok: true });
  }
  if (p === '/api/enquiry') {
    const kind = ['studio', 'space', 'organisation', 'funder', 'creative', 'other'].includes(d.kind) ? d.kind : null;
    const name = clean(d.name, 60), contact = clean(d.contact, 100), message = clean(d.message, 1000), org = clean(d.org, 100);
    if (!kind || !name || !contact || !message) return json({ error: 'Please complete the form.' }, 422);
    const rec = { id: rid(), ts: nowIso(), kind, name, org, contact: normPhone(contact) || contact, message };
    await store.append(env, 'enquiries', rec);
    notifyAdmin(env,
      `New enquiry: ${kind} from ${name}`,
      `New enquiry received\n\nKind: ${kind}\nName: ${name}\nOrganisation: ${org || 'None'}\nContact: ${rec.contact}\nMessage: ${message}\nTime: ${rec.ts}`);
    return json({ ok: true, id: rec.id }, 201);
  }
  if (p === '/api/cancel') {
    const phone = normPhone(d.phone);
    const eventId = clean(d.event, 50);
    if (!phone || !eventId) return json({ error: 'Phone number and event are required.' }, 422);
    const rs = await store.read(env, 'rsvps');
    const target = rs.find(r => r.event === eventId && r.phone === phone);
    if (!target) return json({ error: 'No RSVP found for this event and phone number.' }, 404);
    const ev = events().find(e => e.id === eventId);
    if (!ev) return json({ error: 'Event not found.' }, 404);
    const updated = rs.filter(r => !(r.event === eventId && r.phone === phone));
    await store.write(env, 'rsvps', updated);
    await store.releaseRsvp(env, eventId, phone);
    notifyAdmin(env,
      `RSVP cancelled: ${target.name} for ${ev.title}`,
      `RSVP cancelled\n\nName: ${target.name}\nPhone: ${phone}\nEvent: ${ev.title}\nTime: ${nowIso()}`);
    const wl = await store.read(env, 'waitlist');
    const next = wl.find(x => x.event === eventId);
    if (next) {
      const r = await registerRsvp(env, cfg, { event: eventId, name: next.name, phone: next.phone, age18: true, remind: true, future: true }, 'waitlist-promotion');
      const promoted = await store.read(env, 'rsvps');
      const newRsvp = promoted.find(r => r.event === eventId && r.phone === next.phone);
      if (newRsvp) {
        const waitlistRemaining = wl.filter(x => !(x.event === eventId && x.phone === next.phone));
        await store.write(env, 'waitlist', waitlistRemaining);
        notifyAdmin(env,
          `Waitlist promoted: ${next.name} for ${ev.title}`,
          `Waitlist promoted\n\nName: ${next.name}\nPhone: ${next.phone}\nEvent: ${ev.title}\nTime: ${nowIso()}`);
        if (cfg.wa.mode === 'api' || cfg.wa.mode === 'auto') {
          wa.sendText(next.phone, `🎉 Great news! A spot opened up for ${ev.title} on ${ev.date} at ${ev.time}. You're now confirmed. We'll message you the exact place. Reply STOP any time to withdraw.`);
        }
      }
    }
    return json({ ok: true, cancelled: true });
  }
  if (p === '/api/role-interest') {
    const role = ['keeper', 'lamplighter', 'flame', 'partner'].includes(d.role) ? d.role : null;
    const name = clean(d.name, 60), contact = clean(d.contact, 100), message = clean(d.message, 500);
    if (!role || !name || !contact) return json({ error: 'Please complete the form.' }, 422);
    const rec = { id: rid(), ts: nowIso(), role, name, contact: normPhone(contact) || contact, message };
    await store.append(env, 'role-interest', rec);
    notifyAdmin(env,
      `Role interest: ${role} from ${name}`,
      `Role interest received\n\nRole: ${role}\nName: ${name}\nContact: ${rec.contact}\nMessage: ${message || 'None'}\nTime: ${rec.ts}`);
    return json({ ok: true, id: rec.id }, 201);
  }
  return json({ error: 'Not found.' }, 404);
}
