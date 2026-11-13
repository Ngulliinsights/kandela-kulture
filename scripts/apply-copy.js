const fs = require('fs');
const path = require('path');
const pub = path.join(__dirname, '..', 'public');

const edits = [
  // ── index.html ──
  ['index.html',
    'What you share along the way becomes something new.</p>',
    'What you share along the way becomes something new. Every new thing you do together is one more reason to stay in touch.</p>'],
  ['index.html',
    'Cook, walk, build, help out. The task does the talking.</p>',
    'Cook, walk, build, help out. The task does the talking; some things only come out at walking pace.</p>'],

  // ── gatherings.html: the nine settings ──
  ['gatherings.html',
    '<h2 class="rv">From past gatherings</h2>',
    `<h2 class="rv">The settings</h2><p class="rv">Same people, a new context. Any of these will do.</p><ul class="ls rv"><li>Walking — take the long way; it’s where the real answers are.</li><li>Building and fixing — build something together; even a wobbly shelf holds a friendship up.</li><li>Volunteering and helping — give an afternoon, get a friend back.</li><li>Games and puzzles — lose a game together, win each other.</li><li>Learning — learn something new, badly, together.</li><li>Making and creating — paint badly, laugh loudly.</li><li>Planting and growing — plant a tree; wait for the friendship to grow with it.</li><li>Getting out of town — change the scenery; watch the people change.</li><li>Quiet company — sit together, say nothing, feel better.</li></ul><h2 class="rv">From past gatherings</h2>`],

  // ── method.html ──
  ['method.html',
    '</figure></div><h2 class="rv">Tell us how your people meet</h2>',
    '</figure></div><p class="rv">One place makes an acquaintance. Two make a friend.</p><h2 class="rv">Tell us how your people meet</h2>'],
  ['method.html',
    'stronger than anything either of the first two contexts gave you on its own.</p>',
    'stronger than anything either of the first two contexts gave you on its own. Same cast. New set.</p>'],
  ['method.html',
    'Side by side: a build day, a cook-together, a walk, a day of volunteering.</p>',
    'Side by side: a build day, a cook-together, a walk, a day of volunteering. Give them a task; they’ll give you a story.</p>'],
  ['method.html',
    'each experience adds to what the group shares.</p>',
    'each experience adds to what the group shares. One night is a spark; many nights are a fire.</p>'],

  // ── teams.html ──
  ['teams.html',
    'What you do together becomes a story only your team has.</p>',
    'What you do together becomes a story only your team has. Same people. New plot.</p>'],

  // ── spaces.html ──
  ['spaces.html',
    '<p class="ld">For developers, venues, employers and alumni networks.</p></div></section>',
    '<p class="ld">For developers, venues, employers and alumni networks.</p><p class="rv">Not a new face. A new place.</p></div></section>'],
  ['spaces.html',
    '<li>A named contact.</li></ul><div class="cta rv"><a class="bt" data-wa="partner">Start a conversation</a>',
    '<li>A named contact.</li></ul><p class="rv">Friends don’t need a reason. They need a room.</p><div class="cta rv"><a class="bt" data-wa="partner">Start a conversation</a>'],

  // ── join.html ──
  ['join.html',
    '</ol><h2 class="rv">Come as you are</h2>',
    '</ol><p class="rv">Be beginners together — it’s the one level everyone starts at.</p><h2 class="rv">Come as you are</h2>'],

  // ── lighting.html ──
  ['lighting.html',
    '</ol><h2 class="rv">Safety first</h2>',
    '</ol><p class="rv">Sit together. Say nothing. Feel better. Friends who can be silent together are the keepers.</p><h2 class="rv">Safety first</h2>'],

  // ── lamplighters.html ──
  ['lamplighters.html',
    'thanks that mean something.</p><div class="cta rv">',
    'thanks that mean something.</p><p class="rv">Give an afternoon. Get a friend back.</p><div class="cta rv">'],

  // ── faq.html ──
  ['faq.html',
    '<details class="rv"><summary>Who is it for?</summary>',
    '<details class="rv"><summary>What do people actually do?</summary><p>Side by side: walk and talk, cook together, build, volunteer, play games, learn something new, make things, plant, get out of town — or just sit in the same room. Same people, a new context.</p></details><details class="rv"><summary>Who is it for?</summary>'],

  // ── event pages ──
  ['g-supper-walk.html',
    '</ul><div class="cta rv">',
    '</ul><p class="rv">Take the long way. It’s where the real answers are.</p><div class="cta rv">'],
  ['g-build-day.html',
    '</ul><div class="cta rv">',
    '</ul><p class="rv">Build something together. Even a wobbly shelf holds a friendship up.</p><div class="cta rv">'],

  // ── passport.html ──
  ['passport.html',
    'The Passport starts once there are at least two Hearths.</p>',
    'The Passport starts once there are at least two Hearths. Every new thing you do together is one more reason to stay in touch.</p>'],
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
  html = html.replace(oldStr, newStr);
  fs.writeFileSync(fp, html);
  console.log(`OK   ${file}: ${oldStr.slice(0, 55)}...`);
}
process.exit(fail ? 1 : 0);
