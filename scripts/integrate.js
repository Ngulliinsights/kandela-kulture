const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');

// ── 1. Add favicon link to all HTML files ──
const htmlFiles = fs.readdirSync(pub).filter(f => f.endsWith('.html'));
let faviconCount = 0;
for (const file of htmlFiles) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (html.includes('rel="icon"')) continue; // already has favicon
  // Insert before the first <link rel="preload"
  const anchor = '<link rel="preload"';
  const idx = html.indexOf(anchor);
  if (idx !== -1) {
    html = html.slice(0, idx) + '<link rel="icon" href="favicon.svg" type="image/svg+xml">' + html.slice(idx);
  } else {
    // fallback: insert before </head>
    html = html.replace('</head>', '<link rel="icon" href="favicon.svg" type="image/svg+xml"></head>');
  }
  fs.writeFileSync(fp, html);
  faviconCount++;
}
console.log(`Favicon link added to ${faviconCount} HTML files`);

// ── 2. Replace slot placeholders with real photos ──
const slotMap = {
  'supper-dusk':    { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-01.webp', w: 1600, h: 1066 },
  'hike-line':      { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-02.webp', w: 1600, h: 900 },
  'build-day':      { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-03.webp', w: 1600, h: 900 },
  'hands-flame':    { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-04.webp', w: 1600, h: 1066 },
  'studio-floor':   { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-05.webp', w: 1600, h: 1066 },
  'night-walk':     { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-06.webp', w: 1600, h: 1066 },
  'courtyard':      { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-07.webp', w: 1600, h: 1066 },
  'candles':        { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-08.webp', w: 1600, h: 1066 },
  'laughing-away':  { photo: 'assets/freeform/photos/2026-11-01-gathering/community-selfie-01.webp',  w: 1280, h: 960 },
  'welcome-desk':   { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-09.webp', w: 1600, h: 1066 },
  'keeper-room':    { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-10.webp', w: 1600, h: 1066 },
  'lamp-setup':     { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-11.webp', w: 1066, h: 1600 },
  'lighting-room':  { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-12.webp', w: 1600, h: 1066 },
  'passing-light':  { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-13.webp', w: 1600, h: 1066 },
  'table-hands':    { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-14.webp', w: 1600, h: 1066 },
  'volunteers':     { photo: 'assets/freeform/photos/2026-11-05-dance-session/dance-session-15.webp', w: 1600, h: 1066 },
};

// latest-post needs unique photos per page
const latestPostPhotos = {
  'follow.html':     [16, 17, 18, 19, 20, 21],
  'index.html':      [22, 23],
  'gallery.html':    [24, 25],
};

const pagesWithSlots = ['index.html', 'gallery.html', 'gatherings.html', 'about.html', 'join.html', 'keeper.html', 'press.html', 'follow.html'];

let totalReplacements = 0;

for (const file of pagesWithSlots) {
  const fp = path.join(pub, file);
  if (!fs.existsSync(fp)) continue;
  let html = fs.readFileSync(fp, 'utf8');
  let fileReplacements = 0;

  // Replace named slots (not latest-post)
  for (const [slot, info] of Object.entries(slotMap)) {
    const svgPath = `assets/slots/${slot}.svg`;
    if (!html.includes(svgPath)) continue;
    
    // Replace src="assets/slots/X.svg" with the photo
    html = html.split(`src="${svgPath}"`).join(`src="${info.photo}"`);
    // Replace href="assets/slots/X.svg" with the photo (lightbox links)
    html = html.split(`href="${svgPath}"`).join(`href="${info.photo}"`);
    
    // Update width/height near the photo reference
    // Find all img tags with this photo and update dimensions
    const imgRe = new RegExp(`<img src="${info.photo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"([^>]*)>`, 'g');
    html = html.replace(imgRe, (match, attrs) => {
      let newAttrs = attrs
        .replace(/width="[^"]*"/, `width="${info.w}"`)
        .replace(/height="[^"]*"/, `height="${info.h}"`);
      // Strip [Replace] from alt
      newAttrs = newAttrs.replace(/alt="\[Replace\] /g, 'alt="');
      return `<img src="${info.photo}"${newAttrs}>`;
    });
    
    fileReplacements++;
  }

  // Handle latest-post slots
  if (html.includes('assets/slots/latest-post.svg')) {
    const photos = (latestPostPhotos[file] || []).map(n => ({
      photo: `assets/freeform/photos/2026-11-05-dance-session/dance-session-${String(n).padStart(2, '0')}.webp`,
      w: 1600,
      h: 1066,
    }));
    
    let photoIdx = 0;
    // Replace each occurrence one at a time
    while (html.includes('assets/slots/latest-post.svg') && photoIdx < photos.length) {
      const info = photos[photoIdx];
      // Replace just the first occurrence of src
      html = html.replace(`src="assets/slots/latest-post.svg"`, `src="${info.photo}"`);
      // Replace just the first occurrence of href
      html = html.replace(`href="assets/slots/latest-post.svg"`, `href="${info.photo}"`);
      photoIdx++;
    }
    
    // If there are still remaining latest-post refs (more than our photo list), use remaining dance session photos
    let overflow = 26;
    while (html.includes('assets/slots/latest-post.svg')) {
      const p = `assets/freeform/photos/2026-11-05-dance-session/dance-session-${String(overflow).padStart(2, '0')}.webp`;
      html = html.replace(`src="assets/slots/latest-post.svg"`, `src="${p}"`);
      html = html.replace(`href="assets/slots/latest-post.svg"`, `href="${p}"`);
      overflow++;
    }
    
    // Fix dimensions and alt text for all dance-session photos in latest-post slots
    const lpRe = /<img src="assets\/freeform\/photos\/2026-11-05-dance-session\/dance-session-\d+\.webp"([^>]*)>/g;
    html = html.replace(lpRe, (match, attrs) => {
      let newAttrs = attrs
        .replace(/width="[^"]*"/, 'width="1600"')
        .replace(/height="[^"]*"/, 'height="1066"');
      newAttrs = newAttrs.replace(/alt="\[Replace\] /g, 'alt="');
      return match.replace(attrs, newAttrs);
    });
    
    fileReplacements++;
  }

  // Final pass: strip any remaining [Replace] prefixes from alt text
  html = html.replace(/alt="\[Replace\] /g, 'alt="');

  fs.writeFileSync(fp, html);
  totalReplacements += fileReplacements;
  console.log(`${file}: ${fileReplacements} slot types replaced`);
}

console.log(`\nTotal: ${totalReplacements} slot replacements across ${pagesWithSlots.length} pages`);

// ── 3. Verify all photo files exist ──
console.log('\nVerifying photo files exist...');
let missing = 0;
for (const file of pagesWithSlots) {
  const fp = path.join(pub, file);
  if (!fs.existsSync(fp)) continue;
  const html = fs.readFileSync(fp, 'utf8');
  const refs = html.match(/src="assets\/freeform\/photos\/[^"]+"/g) || [];
  for (const ref of refs) {
    const p = ref.slice(5, -1); // strip src=" and "
    if (!fs.existsSync(path.join(pub, p))) {
      console.log(`  MISSING: ${p} in ${file}`);
      missing++;
    }
  }
}
console.log(missing === 0 ? 'All photo files verified ✓' : `${missing} files missing!`);
