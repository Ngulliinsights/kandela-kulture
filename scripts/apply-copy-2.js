const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');

const edits = [
  // ── manifesto.html: the giving line, in the reading block ──
  ['manifesto.html',
    '<p>You don’t just watch Kandela. You carry it.</p></div>',
    '<p>You don’t just watch Kandela. You carry it.</p><p>Light is the one thing you pass on and still have.</p></div>'],

  // ── keeper.html: shared effort, before the CTA ──
  ['keeper.html',
    'Rotating hosts, so nobody holds rank.</li></ul><div class="cta rv">',
    'Rotating hosts, so nobody holds rank.</li></ul><p class="rv">You’ll never forget who held the ladder.</p><div class="cta rv">'],

  // ── flames.html: making, before the CTA ──
  ['flames.html',
    'Respect for the people in the room.</li></ul><div class="cta rv">',
    'Respect for the people in the room.</li></ul><p class="rv">Make something nobody asked for.</p><div class="cta rv">'],

  // ── teams.html: the two ways in, before the CTA ──
  ['teams.html',
    'Time, not a big budget: small and regular beats big and rare.</li></ul><div class="cta rv">',
    'Time, not a big budget: small and regular beats big and rare.</li></ul><p class="rv">Chat is one way in. Chores are another.</p><div class="cta rv">'],
];

let fail = 0;
for (const [file, oldStr, newStr] of edits) {
  const fp = path.join(pub, file);
  let html = fs.readFileSync(fp, 'utf8');
  const count = html.split(oldStr).length - 1;
  if (count !== 1) {
    console.log(`FAIL ${file}: anchor occurs ${count} times -> ${oldStr.slice(0, 60)}`);
    fail++;
    continue;
  }
  fs.writeFileSync(fp, html.replace(oldStr, newStr));
  console.log(`OK   ${file}`);
}

// ── events.json: carry the closing line so regeneration keeps it ──
const evPath = path.join(__dirname, '..', 'data', 'events.json');
const events = JSON.parse(fs.readFileSync(evPath, 'utf8'));
const lines = {
  'supper-walk': 'Take the long way. It’s where the real answers are.',
  'build-day': 'Build something together. Even a wobbly shelf holds a friendship up.',
};
for (const e of events) {
  if (lines[e.id] && e.line !== lines[e.id]) { e.line = lines[e.id]; console.log(`OK   events.json line -> ${e.id}`); }
}
fs.writeFileSync(evPath, JSON.stringify(events, null, 2) + '\n');

process.exit(fail ? 1 : 0);
