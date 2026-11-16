/*! Kandela Kulture: WhatsApp helper.
 * No dependencies, no tracking, no cookies. CSP-safe: external file, no inline code or styles.
 *
 * INSTALL (every page, just before </body>):
 *   <script src="assets/whatsapp.js" data-number="0712 345 678" defer></script>
 * Optional attributes on that tag:
 *   data-events-url="/api/events"   treat dates in that JSON (array of {date:"YYYY-MM-DD"}) as "open" days
 *   data-beacon-url="/api/wa-click" send an anonymous click count (kind only) so the server can switch on API handling
 *                                   at a volume threshold. Same origin only unless the server allows CORS for it.
 * The number can also come from <meta name="kk-wa-number" content="..."> (and kk-wa-events-url).
 *
 * WHAT IT DOES
 *  1. Turns "Message us on WhatsApp" style links/buttons into wa.me links with a page-aware prefilled message.
 *     Opt out per element with data-wa="off". Force-wire any element with data-wa (data-wa="stop" sends "STOP").
 *     Per-element overrides: data-wa-text="..." or data-wa-event="Supper and a walk, 14 Nov".
 *  2. Adds prefilled text to existing wa.me links that have none. Group/channel links are left alone.
 *  3. RSVP page: adds "Continue on WhatsApp instead", built live from the form (gathering, first name, 18+).
 *     It never puts the phone number or the access-needs text in the message.
 *     Existing markup can opt in with <a data-wa-rsvp> and <p data-wa-status>.
 *  4. When the server says a gathering is full, appends a "Join the waiting list on WhatsApp" link.
 *  5. Outside office hours (Mon-Fri 09:00-18:00 EAT, plus gathering days) shows a short "we'll reply next working day" note.
 *     Put <p data-wa-hours> where you want it, otherwise it is inserted after the first button in <main>.
 * If no valid number is configured the script does nothing.
 * Dispatches a PII-free "kk:wa" CustomEvent on document when a WhatsApp link is clicked ({detail:{kind}}).
 */
(() => {
  'use strict';
  const doc = document;
  const script = doc.currentScript || doc.querySelector('script[data-number][src*="whatsapp"]') || doc.querySelector('script[src*="whatsapp"]');
  const meta = n => { const m = doc.querySelector(`meta[name="${n}"]`); return m ? m.content : ''; };
  const opt = (attr, m) => (script && script.getAttribute(attr)) || meta(m) || '';

  // ---- config (edit here) ----
  const HOURS = { days: [1, 2, 3, 4, 5], from: 9, to: 18, tz: 'Africa/Nairobi' };
  const HINT = "We're away right now. Send your message and we'll reply on the next working day (Mon-Fri, 9:00-18:00 EAT, plus gathering days).";
  const HELLO = 'Hello Kandela Kulture, ';
  const MSG = Object.assign(Object.create(null), {
    default: HELLO + 'I found you through your website and have a question.',
    gatherings: HELLO + "I'd like to know more about upcoming gatherings.",
    join: HELLO + "it's my first time. How do I join a gathering?",
    rsvp: HELLO + "I'd like to save a place at a gathering.",
    partners: HELLO + "I'd like to talk about working together.",
    studios: HELLO + "I'm interested in the studios.",
    spaces: HELLO + "I'd like to talk about a space.",
    funders: HELLO + "I'd like to talk about supporting your work.",
    teams: HELLO + 'I would like to ask about working with my team.',
    lamplighters: HELLO + "I'm interested in the Lamplighters.",
    accessibility: HELLO + 'I have a question about access.',
    safety: HELLO + "I'd like to raise a safety concern.",
    faq: HELLO + 'I have a question I could not find in the FAQ.',
    stop: 'STOP',
  });

  // ---- helpers ----
  // Accepts 0712 345 678, +254 712 345 678, 00254..., returns digits for wa.me or ''.
  const toWa = raw => {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '254' + d.slice(1);
    return /^\d{10,15}$/.test(d) ? d : '';
  };
  const clean = (s, n = 120) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
  const NUMBER = toWa(opt('data-number', 'kk-wa-number'));
  if (!NUMBER) { if (typeof console !== 'undefined') console.warn('whatsapp.js: set data-number to a valid WhatsApp number; nothing was changed.'); return; }
  const EVENTS_URL = opt('data-events-url', 'kk-wa-events-url');
  const BEACON = opt('data-beacon-url', 'kk-wa-beacon-url');

  const waUrl = text => `https://wa.me/${NUMBER}?text=${encodeURIComponent(clean(text, 500))}`;
  const isWaHref = h => /^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|web\.whatsapp\.com|whatsapp\.com)\b|^whatsapp:/i.test(h || '');
  const isGroupHref = h => /chat\.whatsapp\.com|whatsapp\.com\/channel/i.test(h || '');

  const pageKey = (() => {
    const forced = doc.body && doc.body.dataset.waPage;
    if (forced) return forced;
    const base = (location.pathname.split('/').pop() || '').replace(/\.html?$/i, '');
    return base && base !== 'index' && MSG[base] ? base : 'default';
  })();
  const textFor = el => {
    const d = el.dataset;
    if (d.waText) return d.waText;
    if (d.waEvent) return `${HELLO}I'd like to save a place at "${clean(d.waEvent, 100)}".`;
    return MSG[d.wa] || MSG[pageKey] || MSG.default;
  };
  const external = a => { a.target = '_blank'; a.rel = 'noopener noreferrer'; };

  // ---- 1 + 2: links and buttons ----
  const wired = [];
  function candidates() {
    const out = new Set(doc.querySelectorAll('[data-wa]'));
    doc.querySelectorAll('a, button').forEach(el => {
      const t = clean(el.textContent, 80);
      if (t.length <= 60 && /whatsapp/i.test(t)) out.add(el);
    });
    return [...out].filter(el => !el.closest('[data-wa="off"]') && !el.hasAttribute('data-kk-wa') && !el.closest('[data-kk-wa-skip]'));
  }
  function wire(el) {
    const forced = el.hasAttribute('data-wa');
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (isGroupHref(href) && !forced) return;
      const m = /^(?:https?:\/\/)?wa\.me\/(\d+)(\?.*)?$/i.exec(href);
      if (m && !forced) {                                   // existing wa.me link: add context text only if missing
        if (!/[?&]text=/.test(href)) el.href = `https://wa.me/${m[1]}?text=${encodeURIComponent(clean(textFor(el), 500))}`;
      } else if (!isWaHref(href) || forced) {
        el.href = waUrl(textFor(el));
      } else return;                                        // some other WhatsApp URL: leave it
      external(el);
    } else {
      el.addEventListener('click', e => { e.preventDefault(); window.open(waUrl(textFor(el)), '_blank', 'noopener'); });
      if (el.tagName === 'BUTTON' && !el.getAttribute('type')) el.type = 'button';
    }
    el.setAttribute('data-kk-wa', el.dataset.wa || pageKey);
    wired.push(el);
  }

  doc.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-kk-wa]');
    if (!el || e.defaultPrevented) return;
    const kind = el.getAttribute('data-kk-wa');
    doc.dispatchEvent(new CustomEvent('kk:wa', { detail: { kind } }));
    if (BEACON && navigator.sendBeacon) {                   // anonymous count only (no number, no text): feeds the server's volume trigger
      try { navigator.sendBeacon(BEACON, new Blob([JSON.stringify({ kind: ['rsvp', 'waitlist', 'stop'].includes(kind) ? kind : 'other' })], { type: 'application/json' })); } catch { /* ignore */ }
    }
  });

  // ---- 3 + 4: RSVP form ----
  const field = (form, key) => form.querySelector(`[name="${key}"], #${key}, [data-field="${key}"]`);
  function eventLabel(form) {
    const f = field(form, 'event');
    if (f && f.tagName === 'SELECT') return f.value && f.selectedOptions[0] ? clean(f.selectedOptions[0].textContent) : '';
    const r = form.querySelector('input[name="event"]:checked, input[type="radio"]:checked') || (f && f.type === 'hidden' ? f : null);
    if (!r) return '';
    const lab = (r.labels && r.labels[0]) || r.closest('label');
    return clean(lab ? lab.textContent : r.value);
  }
  function rsvpText(form) {
    const ev = eventLabel(form), nameEl = field(form, 'name'), name = clean(nameEl && nameEl.value, 60);
    const age = field(form, 'age18'), needs = field(form, 'needs');
    let t = HELLO + "I'd like to save a place" + (ev ? ` at "${ev}"` : '') + '.';
    if (name) t += ` My name is ${name}.`;
    if (age && age.checked) t += " I'm 18 or older.";
    if (needs && clean(needs.value, 5)) t += ' I have access needs I would like to talk through.';   // the details stay out of the URL
    return t;
  }
  function rsvpProblem(form) {
    const hasEvent = field(form, 'event'), age = field(form, 'age18');
    if (hasEvent && !eventLabel(form)) return { msg: 'Please choose a gathering first.', el: hasEvent };
    if (age && !age.checked) return { msg: "Please tick \"I'm 18 or older\" first. Gatherings are for adults.", el: age };
    return null;
  }
  function wireRsvp(form) {
    if (form.hasAttribute('data-kk-wa-form-wired')) return;
    form.setAttribute('data-kk-wa-form-wired', '1');
    let a = form.querySelector('[data-wa-rsvp]'), st = form.querySelector('[data-wa-status]');
    if (!a) {
      const subs = form.querySelectorAll('[type="submit"], button:not([type])'), last = subs[subs.length - 1];
      const box = doc.createElement('div'); box.className = 'kk-wa-alt';
      a = doc.createElement('a'); a.className = ('kk-wa-btn ' + (last ? last.className : '')).trim();
      a.textContent = 'Continue on WhatsApp instead'; a.setAttribute('aria-label', 'Continue on WhatsApp instead (opens in a new tab)');
      box.append(a);
      if (last) last.insertAdjacentElement('afterend', box); else form.append(box);
    }
    if (!st) { st = doc.createElement('p'); st.className = 'kk-wa-status'; st.setAttribute('role', 'status'); st.hidden = true; a.insertAdjacentElement('afterend', st); }
    external(a); a.setAttribute('data-kk-wa', 'rsvp');
    const update = () => { a.href = waUrl(rsvpText(form)); };
    form.addEventListener('input', update); form.addEventListener('change', update); update();
    a.addEventListener('click', e => {
      const p = rsvpProblem(form);
      if (p) { e.preventDefault(); st.textContent = p.msg; st.hidden = false; if (p.el.focus) p.el.focus(); return; }
      st.hidden = true; update();
    });
    watchWaitlist(form);
  }
  function waitlistLink(form) {
    const ev = eventLabel(form), a = doc.createElement('a');
    a.textContent = 'Join the waiting list on WhatsApp'; external(a); a.setAttribute('data-kk-wa', 'waitlist');
    const build = () => waUrl(`${HELLO}this gathering is full. I'd like to join the waiting list${eventLabel(form) || ev ? ` for "${eventLabel(form) || ev}"` : ''}.`);
    a.href = build(); a.addEventListener('click', () => { a.href = build(); });
    return a;
  }
  // The server's "full" error says "Message us on WhatsApp to join the waiting list": give it a real link.
  function watchWaitlist(form) {
    const host = form.closest('main') || form.parentElement || form;
    const scan = () => {
      const w = doc.createTreeWalker(host, NodeFilter.SHOW_TEXT), hits = [];
      for (let n; (n = w.nextNode());) {
        const el = n.parentElement;
        if (!el || el.dataset.kkWl || el.closest('[data-kk-wa], script, style')) continue;
        if (/\bfull\b/i.test(n.nodeValue) && /waiting list/i.test(n.nodeValue)) hits.push(el);
      }
      hits.forEach(el => { el.dataset.kkWl = '1'; el.append(' ', waitlistLink(form)); });
    };
    new MutationObserver(scan).observe(host, { childList: true, subtree: true, characterData: true });
  }

  // ---- 5: office hours ----
  let gatheringDays = new Set(), hint = null;
  function nairobi() {
    const p = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: HOURS.tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
    return { wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hour: Number(p.hour), ymd: `${p.year}-${p.month}-${p.day}` };
  }
  const isOpen = () => { const n = nairobi(); return gatheringDays.has(n.ymd) || (HOURS.days.includes(n.wd) && n.hour >= HOURS.from && n.hour < HOURS.to); };
  function updateHint() {
    const closed = !isOpen();
    if (!hint) {
      hint = doc.querySelector('[data-wa-hours]');
      const host = wired.find(el => el.closest('main')) || null;
      if (!hint && closed && host) { hint = doc.createElement('p'); hint.className = 'kk-wa-hint'; hint.setAttribute('role', 'note'); host.insertAdjacentElement('afterend', hint); }
    }
    if (hint) { hint.textContent = closed ? HINT : ''; hint.hidden = !closed; }
  }
  async function loadDays() {
    if (!EVENTS_URL) return;
    try {
      const r = await fetch(EVENTS_URL, { credentials: 'omit' });
      if (!r.ok) return;
      const list = await r.json();
      gatheringDays = new Set((Array.isArray(list) ? list : []).map(e => e && e.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)));
      updateHint();
    } catch { /* offline or blocked: fall back to weekday hours */ }
  }

  // ---- init ----
  let inited = false;
  function init() {
    if (inited) return;
    inited = true;
    candidates().forEach(wire);
    const form = doc.querySelector('form[data-wa-form]') || [...doc.forms].find(f => field(f, 'phone') && field(f, 'event'));
    if (form) wireRsvp(form);
    updateHint(); loadDays();
    doc.addEventListener('visibilitychange', () => { if (!doc.hidden) updateHint(); });
  }
  window.KandelaWA = Object.freeze({ link: text => waUrl(text || MSG[pageKey]) });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})();
