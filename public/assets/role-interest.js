(() => {
  'use strict';

  const form = document.querySelector('[data-role-interest]');
  const cards = [...document.querySelectorAll('.role-card[data-role]')];
  if (!form || !cards.length) return;

  const $ = (id) => document.getElementById(id);
  const roleInput = $('f-role');
  const nameInput = $('f-name');
  const contactInput = $('f-contact');
  const msg = $('f-message');
  const count = $('f-count');
  const out = $('role-out');
  const ok = $('role-ok');            // must live OUTSIDE the form, or hiding the form hides it too
  const banner = $('ri-banner');
  const bannerTitle = $('ri-banner-title');
  const bannerBadge = $('ri-banner-badge');
  const submitBtn = form.querySelector('button[type="submit"]');

  const ROLE_NAMES = {
    keeper: 'Keeper',
    lamplighter: 'Lamplighter',
    flame: 'Creative collaborator',
    partner: 'Partner'
  };
  const ENDPOINT = '/api/role-interest';
  const TIMEOUT_MS = 15000;

  let sending = false;

  const val = (el) => (el?.value || '').trim();

  function select(card, { focus = false } = {}) {
    const role = card.dataset.role;
    cards.forEach((c) => {
      const on = c === card;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-checked', String(on));
      c.tabIndex = on ? 0 : -1;        // roving tabindex: one tab stop for the whole group
      const pill = c.querySelector('.role-select-txt');
      if (pill) pill.textContent = on ? 'Selected' : 'Select';
    });
    if (roleInput) roleInput.value = role;
    if (banner) {
      banner.classList.add('selected');
      if (bannerTitle) bannerTitle.textContent = `Applying as ${ROLE_NAMES[role] || role}`;
      if (bannerBadge) bannerBadge.textContent = 'Tap another card to switch';
    }
    if (focus) card.focus();
    validate();
  }

  function validate() {
    if (!submitBtn || sending) return;
    const role = val(roleInput);
    const hasDetails = val(nameInput).length >= 2 && val(contactInput);
    submitBtn.disabled = !(role && hasDetails);
    if (!role) {
      submitBtn.textContent = 'Choose a role above to proceed';
    } else if (!hasDetails) {
      submitBtn.textContent = 'Fill name and contact to send';
    } else {
      submitBtn.textContent = `Submit ${ROLE_NAMES[role]} interest →`;
    }
  }

  function updateCount() {
    const cur = count?.querySelector('.current');
    if (cur) cur.textContent = msg ? msg.value.length : 0;
  }

  const showError = (text) => { if (out) out.textContent = text; };

  function onCardKey(e) {
    const i = cards.indexOf(e.currentTarget);
    let next = null;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        return select(cards[i]);
      case 'ArrowRight':
      case 'ArrowDown':
        next = cards[(i + 1) % cards.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = cards[(i - 1 + cards.length) % cards.length];
        break;
      default:
        return;
    }
    e.preventDefault();
    select(next, { focus: true });     // arrows move and select, like native radios
  }

  async function submit(e) {
    e.preventDefault();
    if (sending || submitBtn?.disabled) return;

    sending = true;
    showError('');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    const payload = {
      role: val(roleInput),
      name: val(nameInput),
      contact: val(contactInput),
      message: val(msg)
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok) {
        form.hidden = true;
        if (ok) {
          ok.hidden = false;
          ok.focus();
        }
        return;
      }
      showError(body.error || 'Please check the form.');
    } catch {
      showError('We couldn’t reach the server. Try again later.');
    } finally {
      clearTimeout(timer);
      sending = false;
      if (!form.hidden) validate();
    }
  }

  cards.forEach((c, i) => {
    c.tabIndex = i === 0 ? 0 : -1;
    c.addEventListener('click', () => select(c));
    c.addEventListener('keydown', onCardKey);
  });

  msg?.addEventListener('input', updateCount);
  nameInput?.addEventListener('input', validate);
  contactInput?.addEventListener('input', validate);
  form.addEventListener('submit', submit);

  updateCount();
  validate();
})();
