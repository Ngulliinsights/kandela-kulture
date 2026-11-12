'use strict';
// Run daily (cron): node scripts/purge.js  . Deletes RSVP data past retention unless the person opted in to future gatherings.
const { createApp } = require('../server/app');
const { purge } = createApp({ log: false });
console.log(JSON.stringify(purge()));
