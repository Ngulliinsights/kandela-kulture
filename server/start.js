'use strict';
const { createApp } = require('./app');
const mailer = require('./mailer');

const port = Number(process.env.PORT || 3000);
const app = createApp();
const { server, cfg } = app;

mailer.init();

if (!cfg.adminToken) console.warn('ADMIN_TOKEN is not set: admin endpoints are disabled.');
else if (cfg.adminToken.length < 24) console.warn('ADMIN_TOKEN is short: use at least 24 random characters.');
if (cfg.salt === 'dev-salt-change-me') console.warn('HASH_SALT is not set: using the insecure development salt.');
if (cfg.siteOrigin.endsWith('.example')) console.warn('SITE_ORIGIN is a placeholder: /api/translate will not work until it is set.');

// Fail fast on a broken events file rather than on the first visitor's request.
try { app.events(); } catch (e) { console.error('Invalid events file:', e.message); process.exit(1); }

console.log('WhatsApp:', app.wa.status().next);

// Retention purge is opt-in (AUTO_PURGE=1): it deletes data, so it should be a deliberate choice.
let timer = null;
if (process.env.AUTO_PURGE === '1') {
  const run = () => { try { console.log('purge', JSON.stringify(app.purge())); } catch (e) { console.error('purge failed:', e.message); } };
  run();
  timer = setInterval(run, 24 * 3600 * 1000);
  timer.unref();
}

server.listen(port, () => console.log(`Kandela site on http://localhost:${port}`));

function shutdown(sig) {
  console.log(`${sig} received, shutting down`);
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
  server.closeIdleConnections?.();
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
