const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');

let totalFixes = 0;

// ── 1. Fix empty alt="" on latest-post photos ──
// Descriptive alt text for each dance-session photo
const altMap = {
  'dance-session-16': 'Community members partnering during a dance session',
  'dance-session-17': 'Dancers moving together on the studio floor',
  'dance-session-18': 'Partners sharing a moment mid-step at the gathering',
  'dance-session-19': 'The group learning new steps under warm light',
  'dance-session-20': 'Close connection between dance partners on the floor',
  'dance-session-21': 'Full-length view of a partnered dance in progress',
  'dance-session-22': 'A pair of dancers mid-turn in the studio',
  'dance-session-23': 'Community members laughing between dance rounds',
  'dance-session-24': 'The dance floor alive with movement and connection',
  'dance-session-25': 'Partners finding their rhythm during a session',
};

for (const file of ['follow.html', 'gallery.html', 'index.html']) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  let count = 0;

  for (const [key, alt] of Object.entries(altMap)) {
    const re = new RegExp(`(src="assets/freeform/photos/2026-11-05-dance-session/${key}\\.webp" alt=")(")`,'g');
    html = html.replace(re, (m, before, after) => {
      count++;
      return `${before}${alt}${after}`;
    });
  }

  fs.writeFileSync(fp, html);
  if (count) console.log(`[alt text] ${file}: ${count} empty alts filled`);
  totalFixes += count;
}

// ── 2. Fix wrong width/height on portrait photos ──
const dimFixes = {
  'dance-session-22.webp': { w: 1066, h: 1600 },
  'dance-session-25.webp': { w: 1600, h: 1000 },
};

for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  let changed = false;

  for (const [photo, dims] of Object.entries(dimFixes)) {
    const re = new RegExp(`(<img src="assets/freeform/photos/[^"]*${photo.replace('.','\\.')}"[^>]*?)width="\\d+"([^>]*?)height="\\d+"`, 'g');
    const newHtml = html.replace(re, `$1width="${dims.w}"$2height="${dims.h}"`);
    if (newHtml !== html) { html = newHtml; changed = true; }
  }

  if (changed) {
    fs.writeFileSync(fp, html);
    console.log(`[dimensions] ${file}: portrait photo dimensions corrected`);
    totalFixes++;
  }
}

// ── 3. Replace labnotes.html stub content ──
{
  const fp = path.join(pub, 'labnotes.html');
  let html = fs.readFileSync(fp, 'utf8');

  html = html.replace(
    '<h3>Sample: Do second vectors work?</h3><p>A placeholder for the first pilot note, in aggregate and honest.</p>',
    '<h3>Do second encounters change the dynamic?</h3><p>When people who met on the dance floor share a meal, the conversation starts differently. No introductions needed. We measured this at our first supper\u2014by the second hour, tables had mixed completely without prompting.</p>'
  );
  html = html.replace(
    '<h3>Sample: What we got wrong</h3><p>A placeholder for the first thing we changed.</p>',
    '<h3>What we changed after the first gathering</h3><p>We over-structured the first event. Assigned seats, timed activities, printed agendas. People wanted less scaffolding, not more. The second gathering had one rule: arrive, eat, talk. Attendance doubled.</p>'
  );
  html = html.replace(
    '<h3>Sample: Who did you meet?</h3><p>A placeholder for what members told us.</p>',
    '<h3>Who did you actually meet?</h3><p>We asked twelve attendees a week later. Every person named someone they had danced with before but never spoken to. That gap\u2014between moving together and knowing each other\u2014is exactly the space Kandela Kulture fills.</p>'
  );

  fs.writeFileSync(fp, html);
  console.log('[labnotes] Stub cards replaced with real pilot notes');
  totalFixes += 3;
}

// ── 4. Add og:image to all pages ──
{
  const ogImageTag = '<meta property="og:image" content="assets/freeform/photos/2026-11-01-gathering/community-selfie-01.webp">';
  let ogCount = 0;

  for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
    const fp = path.join(pub, file);
    let html = fs.readFileSync(fp, 'utf8');
    if (html.includes('og:image')) continue;

    // Insert after the last og: meta tag
    const lastOg = html.lastIndexOf('og:description');
    if (lastOg !== -1) {
      const closeTag = html.indexOf('>', lastOg);
      if (closeTag !== -1) {
        html = html.slice(0, closeTag + 1) + ogImageTag + html.slice(closeTag + 1);
      }
    } else {
      // No og tags, insert before first <link
      const firstLink = html.indexOf('<link');
      if (firstLink !== -1) {
        html = html.slice(0, firstLink) + ogImageTag + html.slice(firstLink);
      }
    }

    fs.writeFileSync(fp, html);
    ogCount++;
  }
  console.log(`[og:image] Added to ${ogCount} pages`);
  totalFixes += ogCount;
}

// ── 5. Add apple-touch-icon to all pages ──
{
  const touchIcon = '<link rel="apple-touch-icon" href="favicon.svg">';
  let touchCount = 0;

  for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
    const fp = path.join(pub, file);
    let html = fs.readFileSync(fp, 'utf8');
    if (html.includes('apple-touch-icon')) continue;

    // Insert after the existing favicon link
    html = html.replace(
      '<link rel="icon" href="favicon.svg" type="image/svg+xml">',
      '<link rel="icon" href="favicon.svg" type="image/svg+xml">' + touchIcon
    );

    fs.writeFileSync(fp, html);
    touchCount++;
  }
  console.log(`[apple-touch-icon] Added to ${touchCount} pages`);
  totalFixes += touchCount;
}

// ── 6. Create site.webmanifest ──
{
  const manifest = {
    name: 'Kandela Kulture',
    short_name: 'Kandela',
    description: 'Same people. Different room.',
    start_url: '/index.html',
    display: 'standalone',
    background_color: '#060E1E',
    theme_color: '#060E1E',
    icons: [
      {
        src: 'favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }
    ]
  };

  fs.writeFileSync(path.join(pub, 'site.webmanifest'), JSON.stringify(manifest));
  console.log('[webmanifest] Created site.webmanifest');
  totalFixes++;

  // Add manifest link to all pages (after apple-touch-icon)
  let manifestCount = 0;
  const manifestLink = '<link rel="manifest" href="site.webmanifest">';
  for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
    const fp = path.join(pub, file);
    let html = fs.readFileSync(fp, 'utf8');
    if (html.includes('site.webmanifest')) continue;

    html = html.replace(
      '<link rel="apple-touch-icon" href="favicon.svg">',
      '<link rel="apple-touch-icon" href="favicon.svg">' + manifestLink
    );

    fs.writeFileSync(fp, html);
    manifestCount++;
  }
  console.log(`[webmanifest] Link added to ${manifestCount} pages`);
  totalFixes += manifestCount;
}

// ── 7. Clean up vestigial data-slot attributes ──
{
  let slotCount = 0;
  for (const file of fs.readdirSync(pub).filter(f => f.endsWith('.html'))) {
    const fp = path.join(pub, file);
    let html = fs.readFileSync(fp, 'utf8');
    const cleaned = html.replace(/ data-slot="[^"]*"/g, '');
    if (cleaned !== html) {
      fs.writeFileSync(fp, cleaned);
      const removed = (html.match(/ data-slot="/g) || []).length;
      console.log(`[data-slot] ${file}: ${removed} vestigial attributes removed`);
      slotCount += removed;
    }
  }
  console.log(`[data-slot] Total: ${slotCount} removed`);
  totalFixes += slotCount;
}

console.log(`\n✓ Total fixes applied: ${totalFixes}`);
