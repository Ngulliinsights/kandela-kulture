'use strict';
// WhatsApp Cloud API add-on, ported from server/wa-api.js to D1 + Workers.
// Dormant until WA_MODE=api, or WA_MODE=auto and the volume threshold is crossed.
// Message text and phone numbers are never logged; only message ids (7 days,
// for de-duplication) and anonymous daily counters are kept.
import * as store from './store.mjs';
import { DAY, rid, sha256hex, hexEq } from './util.mjs';

const KINDS = new Set(['rsvp', 'waitlist', 'stop']);
const PURPOSES = ['event-reminders', 'future-gatherings'];

export function createWhatsApp(deps) {
  const { env, cfg, events, normPhone, registerRsvp, consent, consentState, makeLimiter, clean } = deps;
  const w = cfg.wa;
  const iso = () => new Date().toISOString();
  const log = (...a) => console.log('wa:', ...a);
  const limited = makeLimiter(env, 8);            // per sender, per minute (D1-backed)
  let seenP = null;                               // processed message ids (lazy promise)

  // ---------- volume counters (anonymous, daily) ----------
  const bump = (day, kind) => store.waBump(env, day, kind);
  async function since(days, pred) {
    const cut = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
    const rows = await store.waStats(env);
    return rows.filter(r => r.day >= cut && pred(r.kind)).reduce((s, r) => s + r.n, 0);
  }
  const chats30 = () => since(30, k => k !== 'reply');
  const replies30 = () => since(30, k => k === 'reply');
  const click = kind => { if (w.mode !== 'off') return bump(iso().slice(0, 10), KINDS.has(kind) ? kind : 'other'); };

  // ---------- the volume trigger ----------
  async function active() {
    if (w.mode === 'api') return true;
    if (w.mode !== 'auto') return false;
    if ((await store.read(env, 'wa_state')).length) return true;   // latched: stays on once crossed
    if (await chats30() >= w.threshold) {
      await store.append(env, 'wa_state', { ts: iso(), reason: 'volume', threshold: w.threshold });
      log('volume threshold reached: API handling is now on');
      return true;
    }
    return false;
  }
  async function status() {
    const on = await active(), c = await chats30(), st = (await store.read(env, 'wa_state'))[0];
    const configured = { webhook: !!(w.verifyToken && w.appSecret), replies: !!(w.token && w.phoneId) };
    let next;
    if (w.mode === 'off') next = 'WhatsApp helper is off.';
    else if (!on) next = `Link mode (free): ${c} of ${w.threshold} chats in the last 30 days.`;
    else if (!configured.webhook || !configured.replies) next = 'API handling is ON but not fully configured: connect the number to the Cloud API and set WA_VERIFY_TOKEN, WA_APP_SECRET, WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID.';
    else next = 'API handling is live.';
    return { mode: w.mode, active: on, threshold: w.threshold, chats30d: c, serviceReplies30d: await replies30(), switchedOnAt: st ? st.ts : null, configured, next };
  }

  // ---------- webhook plumbing ----------
  const verify = async q => {
    const ok = q.get('hub.mode') === 'subscribe' && w.verifyToken &&
      hexEq(await sha256hex(q.get('hub.verify_token') || ''), await sha256hex(w.verifyToken));
    return ok ? String(q.get('hub.challenge') || '').slice(0, 200) : null;
  };
  async function validSig(raw, header) {
    if (!w.appSecret) return false;
    const m = /^sha256=([0-9a-f]{64})$/i.exec(header || '');
    if (!m) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(w.appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
    return hexEq(hex, m[1].toLowerCase());
  }
  // Returns { status, done }: respond with status straight away; `done` settles once replies have been sent.
  async function handle(raw, sigHeader) {
    const out = (status, done = Promise.resolve()) => ({ status, done });
    if (!(await validSig(raw, sigHeader))) return out(401);
    let body; try { body = JSON.parse(raw); } catch { return out(400); }
    if (!(await active())) return out(200);                    // below the volume trigger: acknowledge, do nothing
    const jobs = [];
    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
        const v = ch && ch.value;
        if (!v || !Array.isArray(v.messages)) continue;
        for (const m of v.messages) {
          try { const j = await onMessage(m, v); if (j) jobs.push(j); }
          catch (e) { log('message failed:', e.message); }
        }
      }
    }
    return out(200, Promise.allSettled(jobs).then(() => {}));
  }
  async function send(phone, body) {
    if (!w.token || !w.phoneId) return false;
    try {
      const r = await fetch(`https://graph.facebook.com/${w.graphVersion}/${w.phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + w.token, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.slice(1), type: 'text', text: { body, preview_url: false } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { log('reply rejected, status', r.status); return false; }
      await bump(iso().slice(0, 10), 'reply');
      return true;
    } catch (e) { log('reply failed:', e.message); return false; }
  }

  // ---------- message handling ----------
  const when = e => new Date(e.date + 'T12:00:00+03:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }) + (e.time ? ' at ' + e.time : '');
  const hasData = async phone =>
    (await store.read(env, 'rsvps')).some(r => r.phone === phone) ||
    (await store.read(env, 'consents')).some(c => c.phone === phone);

  async function onMessage(m, v) {
    if (!m || typeof m.id !== 'string') return null;
    if (w.phoneId && v.metadata && v.metadata.phone_number_id !== w.phoneId) return null;
    if (!seenP) seenP = store.read(env, 'wa_msgs').then(rows => new Set(rows.map(x => x.id)));
    const seen = await seenP;
    if (seen.has(m.id)) return null;                        // Meta retries: handle each message once
    seen.add(m.id);
    await store.append(env, 'wa_msgs', { id: m.id, ts: iso() });
    const phone = normPhone('+' + String(m.from || ''));
    if (!phone || m.type !== 'text' || !m.text || typeof m.text.body !== 'string') return null;
    if (await limited('wa:' + phone)) return null;
    const text = clean(m.text.body, 500), cmd = text.replace(/[.!\s]+$/, '').toLowerCase();
    const prof = v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name;
    const first = clean(String(prof || '').split(' ')[0], 60) || 'Guest';

    if (['stop', 'unsubscribe', 'cancel'].includes(cmd)) {
      if (await hasData(phone)) {
        const st = await consentState(env);
        for (const p of PURPOSES) if (st.get(phone + '|' + p) !== 'withdraw') await consent(env, phone, p, 'withdraw', 'whatsapp');
      }
      return send(phone, 'Done. We will not send you reminders or news. You are still welcome at any gathering.');
    }
    if (cmd === 'remind' || cmd === 'future') {
      if (!(await store.read(env, 'rsvps')).some(r => r.phone === phone))
        return send(phone, 'We could not find a booking for this number. Send us the RSVP message from our website first.');
      await consent(env, phone, cmd === 'remind' ? 'event-reminders' : 'future-gatherings', 'grant', 'whatsapp');
      return send(phone, cmd === 'remind' ? "Got it. We'll remind you the day before." : "Got it. We'll tell you about future gatherings. Reply STOP any time.");
    }
    const wantsWaitlist = /waiting list/i.test(text);
    if (wantsWaitlist || /save a place/i.test(text)) {
      const ev = matchEvent(text);
      if (!ev) return send(phone, 'Which gathering is this for? Please use the RSVP form on our website, or send your message again with the gathering name.');
      if (wantsWaitlist) return joinWaitlist(phone, ev, first);
      if (!/18 or (older|over)|18\+/i.test(text)) return send(phone, 'Gatherings are for people aged 18 and over. If that is you, send your message again and say "I am 18 or older".');
      const nm = /my name is (.+?)\.(?:\s|$)/i.exec(text);
      const r = await registerRsvp(env, cfg,
        { name: nm ? nm[1] : first, phone, needs: /access needs/i.test(text) ? 'Asked to talk through access needs on WhatsApp' : '', event: ev.id, age18: true, remind: false, future: false }, 'whatsapp');
      if (r.code === 409) return send(phone, `"${ev.title}" is full. ${await joinWaitlist(phone, ev, first)}`);
      if (r.error) return send(phone, r.error);
      if (r.already) return send(phone, `You are already on the list for "${ev.title}" (${when(ev)}).`);
      return send(phone, `You're on the list for "${ev.title}" (${when(ev)}). Reply REMIND for a reminder the day before, FUTURE for news of future gatherings, or STOP any time.`);
    }
    return null;                                            // anything else is for a human to answer
  }
  function matchEvent(text) {
    const low = text.toLowerCase();
    const hits = events().filter(e => e.title && low.includes(String(e.title).toLowerCase())).sort((a, b) => b.title.length - a.title.length);
    return hits.length && (!hits[1] || hits[1].title.length < hits[0].title.length) ? hits[0] : null;
  }
  async function joinWaitlist(phone, ev, name) {
    const wl = await store.read(env, 'waitlist');
    if (!wl.some(x => x.event === ev.id && x.phone === phone))
      await store.append(env, 'waitlist', { id: rid(), ts: iso(), event: ev.id, name, phone });
    return `You're on the waiting list for "${ev.title}" (${when(ev)}). If a place opens we'll message you here.`;
  }

  // ---------- housekeeping (called from purge / cron) ----------
  async function prune() {
    const cut = new Date(Date.now() - 90 * DAY).toISOString().slice(0, 10);
    await store.waStatsPrune(env, cut);
    const mc = Date.now() - 7 * DAY;
    const ms = await store.read(env, 'wa_msgs');
    const km = ms.filter(x => Date.parse(x.ts) >= mc);
    if (km.length !== ms.length) { await store.write(env, 'wa_msgs', km); seenP = null; }
  }

  return { click, verify, handle, status, active, prune };
}
