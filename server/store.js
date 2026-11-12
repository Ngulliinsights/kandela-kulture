'use strict';
// Tiny append-only JSONL store. Fine for pilot scale (hundreds of rows); swap for SQLite/Postgres later.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
class Store {
  constructor(dir) { this.dir = dir; fs.mkdirSync(dir, { recursive: true }); }
  f(n) { return path.join(this.dir, n + '.jsonl'); }
  read(n) { try { return fs.readFileSync(this.f(n), 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (e) { if (e.code === 'ENOENT') return []; throw e; } }
  append(n, o) { fs.appendFileSync(this.f(n), JSON.stringify(o) + '\n', { mode: 0o600 }); }
  write(n, rows) { const t = this.f(n) + '.tmp'; fs.writeFileSync(t, rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''), { mode: 0o600 }); fs.renameSync(t, this.f(n)); }
  id() { return crypto.randomBytes(8).toString('hex'); }
  hash(phone, salt) { return crypto.createHash('sha256').update(salt + phone).digest('hex').slice(0, 16); }
}
module.exports = { Store };
