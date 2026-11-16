'use strict';
// Run daily (cron): node scripts/purge.js  . Deletes RSVP data past retention unless the person opted in to future gatherings.
// Prefers the running server's admin endpoint so its in-memory store cache stays in sync;
// falls back to a direct purge when the server isn't reachable (e.g. during maintenance).
const port = process.env.PORT || 3000;
const token = process.env.ADMIN_TOKEN;

(async () => {
  if (token) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/admin/purge`, { method: 'POST', headers: { authorization: 'Bearer ' + token } });
      if (r.ok) { console.log(await r.text()); return; }
      console.error('purge endpoint returned', r.status);
    } catch (e) { console.error('purge endpoint unreachable:', e.message); }
  }
  const { createApp } = require('../server/app');
  const { purge } = createApp({ log: false });
  console.log(JSON.stringify(purge()));
})();
