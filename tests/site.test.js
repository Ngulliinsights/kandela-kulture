'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const PUB = path.join(__dirname, '..', 'public');
const pages = fs.readdirSync(PUB).filter(f => f.endsWith('.html')).sort();
const read = f => fs.readFileSync(path.join(PUB, f), 'utf8');
const VOID = new Set(['meta', 'link', 'br', 'hr', 'img', 'input', 'source', 'area', 'base', 'col', 'embed', 'track', 'wbr', 'path', 'circle', 'rect', 'use', 'stop']);
const each = fn => pages.forEach(p => fn(p, read(p)));

test('there are pages to test', () => assert.ok(pages.length >= 25, 'found ' + pages.length));

test('every page has the essentials', () => each((p, h) => {
  assert.match(h, /^<!doctype html>/i, p); assert.match(h, /<html lang="en"/, p); assert.match(h, /<title>[^<]{5,}<\/title>/, p);
  assert.match(h, /<meta name="viewport" content="[^"]*width=device-width/, p); assert.match(h, /<meta name="description" content="[^"]{10,}"/, p);
  assert.equal((h.match(/<h1[ >]/g) || []).length, 1, p + ' h1 count'); assert.match(h, /<a class="sk" href="#main">/, p); assert.match(h, /<main id="main"/, p);
  assert.match(h, /<header>/, p); assert.match(h, /<footer>/, p); assert.match(h, /<nav aria-label="Main">/, p);
}));

test('titles are unique', () => { const t = pages.map(p => read(p).match(/<title>([^<]*)<\/title>/)[1]); assert.equal(new Set(t).size, t.length); });

test('tags are balanced on every page', () => each((p, h) => {
  const body = h.replace(/<!--.*?-->/gs, '').replace(/<(script|style)[^>]*>.*?<\/\1>/gs, ''); const st = [];
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>/g)) {
    const [, close, tag, , self] = m, t = tag.toLowerCase(); if (VOID.has(t) || self) continue;
    if (close) { assert.equal(st.pop(), t, `${p}: unexpected </${t}>`); } else st.push(t);
  }
  assert.deepEqual(st, [], p + ' unclosed');
}));

test('heading levels never skip downward', () => each((p, h) => {
  let last = 0; for (const m of h.matchAll(/<h([1-6])[ >]/g)) { const n = +m[1]; assert.ok(n <= last + 1, `${p}: h${n} after h${last}`); last = n; }
}));

test('ids are unique per page', () => each((p, h) => { const ids = [...h.matchAll(/ id="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length, p + ' duplicate ids'); }));

test('internal links and assets resolve', () => each((p, h) => {
  for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = m[1]; if (/^(#|mailto:|tel:)/.test(u)) continue; assert.ok(!/^https?:|^\/\//.test(u), `${p}: external URL ${u}`);
    const f = u.split('#')[0].split('?')[0]; if (f) assert.ok(fs.existsSync(path.join(PUB, f)), `${p}: broken ${u}`);
  }
}));

test('no inline styles, inline scripts or event handlers (strict CSP)', () => each((p, h) => {
  assert.ok(!/ style="/.test(h), p + ' inline style'); assert.ok(!/<script(?![^>]*\bsrc=)/.test(h), p + ' inline script'); assert.ok(!/ on[a-z]+="/.test(h), p + ' handler');
}));

test('no third-party hosts anywhere in public/', () => {
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : files.push(path.join(d, f.name)); })(PUB);
  for (const f of files.filter(x => /\.(html|css|js|svg)$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8').replace(/https?:\/\/(www\.w3\.org|kandelakulture\.example|wa\.me|(www\.)?instagram\.com|(www\.)?tiktok\.com|translate\.google\.com)[^"' )]*/g, '');
    assert.ok(!/https?:\/\//.test(s), path.relative(PUB, f) + ' references ' + (s.match(/https?:\/\/[^"' )]*/) || [''])[0]);
  }
});

test('no C2PA or provenance cryptographic metadata in assets', () => {
  const files = []; (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) f.isDirectory() ? walk(path.join(d, f.name)) : files.push(path.join(d, f.name)); })(PUB);
  for (const f of files.filter(x => /\.(png|svg|webp)$/i.test(x))) {
    const s = fs.readFileSync(f).toString('latin1');
    assert.ok(!/c2pa|jumbf/i.test(s), path.relative(PUB, f) + ' contains C2PA metadata');
  }
});

test('RSVP form is accessible: labels, required fields, honeypot hidden', () => {
  const h = read('rsvp.html');
  for (const m of h.matchAll(/<(input|select)([^>]*)>/g)) { if (/name="website"/.test(m[2])) continue; const a = m[2], id = (a.match(/ id="([^"]+)"/) || [])[1], type = (a.match(/ type="([^"]+)"/) || [])[1]; if (type === 'checkbox') continue; assert.ok(id && new RegExp(`<label for="${id}"`).test(h), 'no label for ' + a); }
  assert.match(h, /name="age18" required/); assert.match(h, /<p class="hp" aria-hidden="true">/); assert.match(h, /tabindex="-1"/);
  assert.ok(!/name="remind" required|name="future" required/.test(h), 'optional consents must not be required');
  assert.ok(!/name="remind" checked|name="future" checked/.test(h), 'consents must not be pre-ticked');
});

test('performance budgets', () => {
  const size = f => fs.statSync(path.join(PUB, f)).size;
  for (const p of pages) assert.ok(size(p) <= 60 * 1024, `${p} is ${size(p)} bytes`);
  assert.ok(size('assets/style.css') <= 40 * 1024, 'css'); assert.ok(size('assets/app.js') <= 14 * 1024, 'app.js'); assert.ok(size('assets/creative.js') <= 16 * 1024, 'creative.js');
  const fonts = fs.readdirSync(path.join(PUB, 'assets/fonts')).filter(f => f.endsWith('.woff2')).filter(f => !/italic/.test(f)).reduce((a, f) => a + size('assets/fonts/' + f), 0); assert.ok(fonts <= 125 * 1024, 'fonts ' + fonts);
  for (const f of fs.readdirSync(path.join(PUB, 'assets/patterns'))) assert.ok(size('assets/patterns/' + f) <= 60 * 1024, f);
});

test('every pattern used has a rule and both theme files', () => {
  const css = fs.readFileSync(path.join(PUB, 'assets/style.css'), 'utf8'); const used = new Set();
  each((p, h) => { for (const m of h.matchAll(/class="bgp pt-([A-Za-z]+)/g)) used.add(m[1]); });
  assert.ok(used.size >= 6, 'patterns used: ' + [...used]);
  for (const n of used) { assert.ok(css.includes(`.pt-${n}{`), 'css ' + n); for (const t of ['dark', 'light']) assert.ok(fs.existsSync(path.join(PUB, `assets/patterns/${n}-${t}.svg`)), `${n}-${t}`); }
});

test('brand colour pairings meet contrast targets', () => {
  const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; };
  const L = h => { const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return .2126 * lin(r) + .7152 * lin(g) + .0722 * lin(b); };
  const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const pairs = [['#F0EDE7', '#060E1E', 4.5], ['#060E1E', '#F0EDE7', 4.5], ['#060E1E', '#FFBA3C', 4.5], ['#FFBA3C', '#060E1E', 4.5], ['#9A9283', '#060E1E', 4.5], ['#6B665D', '#F0EDE7', 4.5], ['#B87A00', '#F0EDE7', 3], ['#8A5B00', '#F0EDE7', 4.5], ['#F0EDE7', '#0D1A30', 4.5], ['#060E1E', '#E7E1D5', 4.5]];
  for (const [f, b, min] of pairs) assert.ok(cr(f, b) >= min, `${f} on ${b} = ${cr(f, b).toFixed(2)}`);
});

test('sitemap lists every public page; robots blocks the API', () => {
  const sm = read('sitemap.xml'), rb = read('robots.txt');
  for (const p of pages.filter(p => !['404.html', 'offline.html'].includes(p))) assert.ok(sm.includes('/' + p), 'sitemap misses ' + p);
  assert.ok(!sm.includes('404.html') && !sm.includes('offline.html')); assert.match(rb, /Disallow: \/api\//);
});

test('logo sprite has the three marks and the service worker never caches the API', () => {
  const l = read('assets/logo.svg'); for (const id of ['mk', 'wm', 'ico']) assert.ok(l.includes(`id="${id}"`), id);
  assert.match(read('sw.js'), /startsWith\('\/api\/'\)/);
});

test('experimental layer: progressive, accessible, and safe', () => {
  const c = read('assets/creative.js'), css = read('assets/style.css');
  assert.match(c, /prefers-reduced-motion:reduce/); assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{@view-transition\{navigation:none\}/);
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|eval\(|new Function|innerHTML|document\.write/.test(c), 'no network, eval or innerHTML in creative.js');
  assert.match(c, /addEventListener\('click',\(\)=>\{on=!on;[^}]*new A\(\)/, 'audio is created only after a click');
  assert.match(css, /@view-transition\{navigation:auto\}/);
  const home = read('index.html'); assert.match(home, /<canvas id="river" class="bgp cv" aria-hidden="true">/); assert.match(home, /class="bgp pt-C st"/, 'static pattern fallback under the canvas');
  assert.match(read('lighting.html'), /id="snd" type="button" aria-pressed="false">Sound: off/);
  assert.match(read('passport.html'), /class="pp" tabindex="0" role="button"/);
  assert.ok(/class="read rv"/.test(read('manifesto.html')));
  each((p, h) => assert.match(h, /<script src="assets\/creative\.js" defer>/, p));
  assert.match(read('index.html'), /id="mb"/);
});

test('typography and motion refinements', () => {
  const css = read('assets/style.css'), app = read('assets/app.js'), cr = read('assets/creative.js');
  assert.ok(!/filter:url\(/.test(css), 'no displacement filter on text'); assert.match(css, /font-optical-sizing:auto/); assert.match(css, /size-adjust:96\.1%/); assert.match(css, /size-adjust:103\.4%/);
  assert.match(css, /--eo:cubic-bezier\(\.16,1,\.3,1\)/); assert.match(css, /text-wrap:balance/); assert.match(css, /text-wrap:pretty/);
  assert.ok(!/(^|[},])\.rv\{[^}]*opacity:0/.test(css), 'content must not be hidden without JavaScript'); assert.match(css, /\.js \.rv:not\(\.gr\)/);
  assert.ok(!/1\.3fr repeat\(auto/.test(css), 'invalid footer grid'); assert.match(css, /\.fg\{display:grid;grid-template-columns:repeat\(auto-fit,minmax\(140px,1fr\)\)/);
  assert.equal((css.match(/@view-transition\{navigation:auto\}/g) || []).length, 1);
  each((p, h) => {
    assert.match(h, /<div id="menu" role="dialog" aria-modal="true" aria-label="Site menu" aria-hidden="true" inert>/, p);
    assert.match(h, /id="mb" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="menu"/, p);
    assert.ok(h.indexOf('assets/vt.js') < h.indexOf('assets/app.js'), p + ': vt.js must load first');
  });
  assert.ok(fs.statSync(path.join(PUB, 'assets/vt.js')).size <= 2048, 'vt.js budget');
  assert.match(app, /let fired=false/); assert.match(app, /addEventListener\('scroll'/); assert.match(app, /classList\.add\('js'\)/); assert.match(app, /aria-expanded/); assert.match(app, /key==='Escape'/);
  assert.match(cr, /split\(' '\)\.forEach\(\(w,i,a\)=>\{const s=document\.createElement\('span'\);s\.className='lt'/, 'headlines animate by word, which keeps kerning');
  assert.match(read('assets/vt.js'), /pagereveal/); assert.match(read('assets/vt.js'), /prefers-reduced-motion/);
});
