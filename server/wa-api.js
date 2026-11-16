'use strict';
// WhatsApp Cloud API add-on ("version B"). Dormant until WA_MODE=api, or WA_MODE=auto and the volume threshold is crossed.
// Version A (free): whatsapp.js links open chats with the number in the WhatsApp Business app. This module only
// matters once that number is connected to the Cloud API: it then records RSVPs / STOP / REMIND / waiting-list
// requests from incoming messages and sends short confirmations.
//
// Privacy: message text and phone numbers are never logged. Only message ids (7 days, for de-duplication) and
// anonymous daily counters are kept. Free-form messages we don't recognise are NOT stored: a person (or your provider's
// inbox) must read them, so keep an inbox in place when you switch to the API.
const crypto = require('node:crypto');

const DAY = 86400000;
const KINDS = new Set(['rsvp', 'waitlist', 'stop']);
const PURPOSES = ['event-reminders', 'future-gatherings'];
const sha = s => crypto.createHash('sha256').update(String(s)).digest();
const same = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));

function createWhatsApp(deps) {
  const { store, cfg, events, normPhone, registerRsvp, consent, consentState, makeLimiter, clean } = deps;
  const fetchFn = deps.fetch || globalThis.fetch;
  const w = cfg.wa;
  const iso = () => new Date(cfg.now()).toISOString();
  const log = (...a) => { if (cfg.log) console.log('wa:', ...a); };
  const limited = makeLimiter(8);              // per sender, per minute
  let seen = null;                             // processed message ids (lazy)

  // ---------- volume counters (anonymous, daily) ----------
  const bump = kind => {
    const rows = store.read('wa_stats'), d = iso().slice(0, 10), row = rows.find(r => r.day === d && r.kind === kind);
    if (row) row.n++; else rows.push({ day: d, kind, n: 1 });
    store.write('wa_stats', rows);
  };
  const since = (days, pred) => {
    const cut = new Date(cfg.now() - days * DAY).toISOString().slice(0, 10);
    return store.read('wa_stats').filter(r => r.day >= cut && pred(r.kind)).reduce((s, r) => s + r.n, 0);
  };
  const chats30 = () => since(30, k => k !== 'reply');       // WhatsApp chats started from the site
  const replies30 = () => since(30, k => k === 'reply');     // replies we sent through the API (budget vs free allowance)
  const click = kind => { if (w.mode !== 'off') bump(KINDS.has(kind) ? kind : 'other'); };

  // ---------- the volume trigger ----------
  function active() {
    if (w.mode === 'api') return true;
    if (w.mode !== 'auto') return false;
    if (store.read('wa_state').length) return true;           // latched: stays on once crossed
    if (chats30() >= w.threshold) {
      store.append('wa_state', { ts: iso(), reason: 'volume', threshold: w.threshold });
      log('volume threshold reached: API handling is now on');
      return true;
    }
    return false;
  }
  function status() {
    const on = active(), c = chats30(), st = store.read('wa_state')[0];
    const configured = { webhook: !!(w.verifyToken && w.appSecret), replies: !!(w.token && w.phoneId) };
    let next;
    if (w.mode === 'off') next = 'WhatsApp helper is off.';
    else if (!on) next = `Link mode (free): ${c} of ${w.threshold} chats in the last 30 days.`;
    else if (!configured.webhook || !configured.replies) next = 'API handling is ON but not fully configured: connect the number to the Cloud API and set WA_VERIFY_TOKEN, WA_APP_SECRET, WA_ACCESS_TOKEN and WA_PHONE_NUMBER_ID.';
    else next = 'API handling is live.';
    return { mode: w.mode, active: on, threshold: w.threshold, chats30d: c, serviceReplies30d: replies30(), switchedOnAt: st ? st.ts : null, configured, next };
  }

  // ---------- webhook plumbing ----------
  const verify = q => {
    const ok = q.get('hub.mode') === 'subscribe' && w.verifyToken && same(q.get('hub.verify_token') || '', w.verifyToken);
    return ok ? String(q.get('hub.challenge') || '').slice(0, 200) : null;
  };
  function validSig(raw, header) {
    if (!w.appSecret) return false;
    const m = /^sha256=([0-9a-f]{64})$/i.exec(header || '');
    if (!m) return false;
    return crypto.timingSafeEqual(crypto.createHmac('sha256', w.appSecret).update(raw).digest(), Buffer.from(m[1], 'hex'));
  }
  // Returns { status, done }: respond with status straight away; `done` settles once replies have been sent.
  function handle(raw, sig) {
    const out = (status, done = Promise.resolve()) => ({ status, done });
    if (!validSig(raw, sig)) return out(401);
    let body; try { body = JSON.parse(raw.toString('utf8')); } catch { return out(400); }
    if (!active()) return out(200);                           // below the volume trigger: acknowledge, do nothing
    const jobs = [];
    for (const entry of Array.isArray(body.entry) ? body.entry : []) {
      for (const ch of Array.isArray(entry.changes) ? entry.changes : []) {
        const v = ch && ch.value;
        if (!v || !Array.isArray(v.messages)) continue;
        for (const m of v.messages) { try { const j = onMessage(m, v); if (j) jobs.push(j); } catch (e) { log('message failed:', e.message); } }
      }
    }
    return out(200, Promise.allSettled(jobs).then(() => {}));
  }
  async function send(phone, body) {
    if (!w.token || !w.phoneId || !fetchFn) return false;
    try {
      const r = await fetchFn(`https://graph.facebook.com/${w.graphVersion}/${w.phoneId}/messages`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + w.token, 'content-type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.slice(1), type: 'text', text: { body, preview_url: false } }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { log('reply rejected, status', r.status); return false; }
      bump('reply');
      return true;
    } catch (e) { log('reply failed:', e.message); return false; }
  }

  // ---------- message handling ----------
  const when = e => new Date(e.date + 'T12:00:00+03:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Nairobi' }) + (e.time ? ' at ' + e.time : '');
  const hasData = phone => store.read('rsvps').some(r => r.phone === phone) || store.read('consents').some(c => c.phone === phone);

  function onMessage(m, v) {
    if (!m || typeof m.id !== 'string') return null;
    if (w.phoneId && v.metadata && v.metadata.phone_number_id !== w.phoneId) return null;
    if (!seen) seen = new Set(store.read('wa_msgs').map(x => x.id));
    if (seen.has(m.id)) return null;                          // Meta retries: handle each message once
    seen.add(m.id); store.append('wa_msgs', { id: m.id, ts: iso() });
    const phone = normPhone('+' + String(m.from || ''));
    if (!phone || m.type !== 'text' || !m.text || typeof m.text.body !== 'string') return null;
    if (limited(phone)) return null;
    const text = clean(m.text.body, 500), cmd = text.replace(/[.!\s]+$/, '').toLowerCase();
    const prof = v.contacts && v.contacts[0] && v.contacts[0].profile && v.contacts[0].profile.name;
    const first = clean(String(prof || '').split(' ')[0], 60) || 'Guest';

    if (['stop', 'unsubscribe', 'cancel'].includes(cmd)) {
      if (hasData(phone)) { const st = consentState(); for (const p of PURPOSES) if (st.get(phone + '|' + p) !== 'withdraw') consent(phone, p, 'withdraw', 'whatsapp'); }
      return send(phone, 'Done. We will not send you reminders or news. You are still welcome at any gathering.');
    }
    if (cmd === 'remind' || cmd === 'future') {
      if (!store.read('rsvps').some(r => r.phone === phone)) return send(phone, 'We could not find a booking for this number. Send us the RSVP message from our website first.');
      consent(phone, cmd === 'remind' ? 'event-reminders' : 'future-gatherings', 'grant', 'whatsapp');
      return send(phone, cmd === 'remind' ? "Got it. We'll remind you the day before." : "Got it. We'll tell you about future gatherings. Reply STOP any time.");
    }
    const wantsWaitlist = /waiting list/i.test(text);
    if (wantsWaitlist || /save a place/i.test(text)) {
      const ev = matchEvent(text);
      if (!ev) return send(phone, 'Which gathering is this for? Please use the RSVP form on our website, or send your message again with the gathering name.');
      if (wantsWaitlist) return send(phone, joinWaitlist(phone, ev, first));
      if (!/18 or (older|over)|18\+/i.test(text)) return send(phone, 'Gatherings are for people aged 18 and over. If that is you, send your message again and say "I am 18 or older".');
      const nm = /my name is (.+?)\.(?:\s|$)/i.exec(text);
      const r = registerRsvp({ name: nm ? nm[1] : first, phone, needs: /access needs/i.test(text) ? 'Asked to talk through access needs on WhatsApp' : '', event: ev.id, age18: true, remind: false, future: false }, 'whatsapp');
      if (r.code === 409) return send(phone, `"${ev.title}" is full. ${joinWaitlist(phone, ev, first)}`);
      if (r.error) return send(phone, r.error);
      if (r.already) return send(phone, `You are already on the list for "${ev.title}" (${when(ev)}).`);
      return send(phone, `You're on the list for "${ev.title}" (${when(ev)}). Reply REMIND for a reminder the day before, FUTURE for news of future gatherings, or STOP any time.`);
    }
    return null;                                              // anything else is for a human to answer
  }
  function matchEvent(text) {
    const low = text.toLowerCase();
    const hits = events().filter(e => e.title && low.includes(String(e.title).toLowerCase())).sort((a, b) => b.title.length - a.title.length);
    return hits.length && (!hits[1] || hits[1].title.length < hits[0].title.length) ? hits[0] : null;
  }
  function joinWaitlist(phone, ev, name) {
    if (!store.read('waitlist').some(x => x.event === ev.id && x.phone === phone)) store.append('waitlist', { id: store.id(), ts: iso(), event: ev.id, name, phone });
    return `You're on the waiting list for "${ev.title}" (${when(ev)}). If a place opens we'll message you here.`;
  }

  // ---------- housekeeping (called from purge) ----------
  function prune() {
    const cut = new Date(cfg.now() - 90 * DAY).toISOString().slice(0, 10), rows = store.read('wa_stats'), kr = rows.filter(r => r.day >= cut);
    if (kr.length !== rows.length) store.write('wa_stats', kr);
    const mc = cfg.now() - 7 * DAY, ms = store.read('wa_msgs'), km = ms.filter(x => Date.parse(x.ts) >= mc);
    if (km.length !== ms.length) { store.write('wa_msgs', km); seen = null; }
  }

  return { click, verify, handle, status, active, prune };
}
module.exports = { createWhatsApp };
