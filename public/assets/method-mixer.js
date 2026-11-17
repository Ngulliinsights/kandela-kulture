(() => {
  'use strict';

  const app = document.getElementById('mx-app');
  if (!app) return;

  const $ = (id) => document.getElementById(id);
  const el = {
    spark: $('o-s'), sparkNote: $('o-s-n'),
    pivot: $('o-p'), pivotNote: $('o-p-n'),
    layer: $('o-l'), layerNote: $('o-l-n'),
    time: $('mx-time'),
    status: $('mx-st'),
    copy: $('mx-cp'),
    wa: $('mx-wa'),
    actions: app.querySelector('.mx-ac')
  };

  const CLOSE_MIN = 15;   // Move 04 is fixed: pass the flame + simple close
  const LAYER_MIN = 40;

  const picked = (name) => [...app.querySelectorAll(`input[name="${name}"]:checked`)];
  const mins = (input) => Number.parseInt(input.dataset.m, 10) || 0;
  const set = (node, text) => { if (node) node.textContent = text; };
  const fmt = (total) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  };

  const pageUrl = (() => {
    const u = new URL(location.href);
    u.hash = '';
    return u.toString();
  })();

  let shareText = '';

  function render() {
    const [spark] = picked('s');
    const [pivot] = picked('p');
    const layers = picked('l');

    const sparkName = spark?.dataset.t || 'Pick a Spark';
    const pivotName = pivot?.dataset.t || 'Pick a Pivot';
    const layerName = layers.map((i) => i.dataset.t).join(', ') || 'No layer (optional)';

    const sparkMin = spark ? mins(spark) : 0;
    const pivotMin = pivot ? mins(pivot) : 0;
    const layerMin = layers.reduce((sum, i) => sum + (mins(i) || LAYER_MIN), 0);
    const total = sparkMin + pivotMin + layerMin + CLOSE_MIN;

    set(el.spark, sparkName);
    set(el.sparkNote, spark ? `${sparkMin} min · ${spark.dataset.n}` : '');
    set(el.pivot, pivotName);
    set(el.pivotNote, pivot ? `${pivotMin} min · ${pivot.dataset.n}` : '');
    set(el.layer, layerName);
    set(
      el.layerNote,
      layers.length
        ? `${layerMin} min · ${layers.length} shared ${layers.length === 1 ? 'pursuit' : 'pursuits'}`
        : `Optional · ${LAYER_MIN} min each`
    );
    set(el.time, `Est. ~${fmt(total)}`);

    shareText = [
      'A Kandela session',
      `Spark: ${sparkName}`,
      `Pivot: ${pivotName}`,
      `Layer: ${layerName}`,
      'Close: pass the flame and a simple close',
      `Time: ~${fmt(total)}`,
      pageUrl
    ].join('\n');

    if (el.wa) el.wa.href = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    set(el.status, '');
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } finally {
      ta.remove();
    }
  }

  async function copy() {
    const ok = () => set(el.status, 'Copied. Pass it on.');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        return ok();
      }
    } catch { /* fall back below */ }
    try {
      if (legacyCopy(shareText)) return ok();
    } catch { /* fall through */ }
    set(el.status, 'Copy failed. Select the text instead.');
  }

  app.addEventListener('change', render);
  el.copy?.addEventListener('click', copy);

  render();
  if (el.actions) el.actions.hidden = false; // actions only appear once JS works
})();
