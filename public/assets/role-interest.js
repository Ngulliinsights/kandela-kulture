(() => {
  const cards = document.querySelectorAll('.role-card[data-role]');
  const roleInput = document.getElementById('f-role');
  const form = document.querySelector('[data-role-interest]');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const msg = document.getElementById('f-message');
  const count = document.getElementById('f-count');
  const out = document.getElementById('role-out');
  const ok = document.getElementById('role-ok');
  const banner = document.getElementById('ri-banner');
  const bannerTitle = document.getElementById('ri-banner-title');
  const bannerBadge = document.getElementById('ri-banner-badge');

  const ROLE_NAMES = {
    keeper: 'Keeper',
    lamplighter: 'Lamplighter',
    flame: 'Creative collaborator',
    partner: 'Partner'
  };

  function select(role) {
    cards.forEach(c => {
      const isSel = c.dataset.role === role;
      c.classList.toggle('selected', isSel);
      c.setAttribute('aria-checked', isSel);
      const pillTxt = c.querySelector('.role-select-txt');
      if (pillTxt) pillTxt.textContent = isSel ? 'Selected' : 'Select';
    });
    if (roleInput) roleInput.value = role;
    if (banner && role) {
      banner.classList.add('selected');
      if (bannerTitle) bannerTitle.textContent = 'Applying as ' + (ROLE_NAMES[role] || role);
      if (bannerBadge) bannerBadge.textContent = 'Tap another card to switch';
    }
    validate();
  }

  function validate() {
    const role = roleInput?.value;
    const name = document.getElementById('f-name')?.value.trim();
    const contact = document.getElementById('f-contact')?.value.trim();
    const isValid = Boolean(role && name && contact);
    if (submitBtn) {
      submitBtn.disabled = !isValid;
      if (!role) {
        submitBtn.textContent = 'Choose a role above to proceed';
      } else if (!name || !contact) {
        submitBtn.textContent = 'Fill name and contact to send';
      } else {
        submitBtn.textContent = 'Submit ' + (ROLE_NAMES[role] || '') + ' interest →';
      }
    }
  }

  function updateCount() {
    const len = msg?.value.length || 0;
    if (count) {
      const cur = count.querySelector('.current');
      if (cur) cur.textContent = len;
    }
  }

  cards.forEach(c => {
    c.addEventListener('click', () => select(c.dataset.role));
    c.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(c.dataset.role);
      }
    });
  });

  if (msg) {
    msg.addEventListener('input', updateCount);
  }

  ['f-name', 'f-contact'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', validate);
  });

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      if (out) out.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      const data = {
        role: roleInput.value,
        name: document.getElementById('f-name').value.trim(),
        contact: document.getElementById('f-contact').value.trim(),
        message: msg ? msg.value.trim() : ''
      };
      try {
        const r = await fetch('/api/role-interest', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data)
        });
        const j = await r.json();
        if (r.ok) {
          form.hidden = true;
          if (ok) {
            ok.hidden = false;
            ok.focus();
          }
        } else {
          if (out) out.textContent = j.error || 'Please check the form.';
          submitBtn.disabled = false;
          validate();
        }
      } catch {
        if (out) out.textContent = 'We couldn't reach the server. Try again later.';
        submitBtn.disabled = false;
        validate();
      }
    });
  }
})();
