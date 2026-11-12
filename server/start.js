'use strict';
const { createApp } = require('./app');
const port = Number(process.env.PORT || 3000);
const { server, cfg } = createApp();
if (!cfg.adminToken) console.warn('ADMIN_TOKEN is not set: admin endpoints are disabled.');
server.listen(port, () => console.log(`Kandela site on http://localhost:${port}`));
