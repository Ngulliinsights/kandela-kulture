(() => {
  const cards = document.querySelectorAll('.role-card[data-role]');
  const roleInput = document.getElementById('f-role');
  const form = document.querySelector('[data-role-interest]');
  const submitBtn = form?.querySelector('button[type="submit"]');
  const msg = document.getElementById('f-message');
  const count = document.getElementById('f-count');
  const out = document.getElementById('role-out');
  const ok = document.getElementById('role-ok');

  function select(role) {
    cards.forEach(c => {
      const isSel = c.dataset.role === role;
      c.classList.toggle('selected', isSel);
      c.setAttribute('aria-checked', isSel);
    });
    if (roleInput) roleInput.value = role;
    validate();
  }

  function validate() {
    const role = roleInput?.value;
    const name = document.getElementById('f-name')?.value.trim();
    const contact = document.getElementById('f-contact')?.value.trim();
    if (submitBtn) submitBtn.disabled = !(role && name && contact);
  }

  function updateCount() {
    const len = msg?.value.length || 0;
    if (count) count.querySelector('.current').textContent = len;
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
      out.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      const data = {
        role: roleInput.value,
        name: document.getElementById('f-name').value.trim(),
        contact: document.getElementById('f-contact').value.trim(),
        message: msg.value.trim()
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
          ok.hidden = false;
          ok.focus();
        } else {
          out.textContent = j.error || 'Please check the form.';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send interest';
        }
      } catch {
        out.textContent = 'We couldn\'t reach the server. Try again later.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send interest';
      }
    });
  }
})();