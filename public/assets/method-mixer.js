(() => {
  const f = document.getElementById('mx-app');
  if (!f) return;
  const q = (n) => [...f.querySelectorAll(`input[name="${n}"]:checked`)].map(i => i.dataset.t);
  const o = (id) => document.getElementById(id);
  const ac = f.querySelector('.mx-ac');
  const st = o('mx-st');
  let tx = '';
  function r() {
    const s = q('s')[0] || 'Pick a Spark';
    const p = q('p')[0] || 'Pick a Pivot';
    const l = q('l').join(', ') || 'Optional';
    o('o-s').textContent = s;
    o('o-p').textContent = p;
    o('o-l').textContent = l;
    tx = `A Kandela session\nSpark: ${s}\nPivot: ${p}\nLayer: ${l}\nClose: a simple way to close\n${location.href.split('#')[0]}`;
    o('mx-wa').href = `https://wa.me/?text=${encodeURIComponent(tx)}`;
    st.textContent = '';
  }
  f.addEventListener('change', r);
  r();
  ac.hidden = false;
  o('mx-cp').addEventListener('click', () => {
    const done = () => { st.textContent = 'Copied. Pass it on.'; };
    const fallback = () => {
      const a = document.createElement('textarea');
      a.value = tx;
      a.style.position = 'fixed';
      a.style.opacity = '0';
      document.body.appendChild(a);
      a.select();
      try { document.execCommand('copy'); done(); } catch { st.textContent = 'Copy failed. Select the text instead.'; }
      a.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tx).then(done, fallback);
    } else { fallback(); }
  });
})();