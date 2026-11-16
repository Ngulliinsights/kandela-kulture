'use strict';
// Tiny append-only JSONL store with an in-memory read cache.
// Single-process only (the cache assumes nothing else edits the files while the app runs).
// Fine for pilot scale (hundreds of rows); swap for SQLite/Postgres before running more than one instance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.cache = new Map();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  f(n) { return path.join(this.dir, n + '.jsonl'); }

  load(n) {
    let rows = this.cache.get(n);
    if (rows) return rows;
    rows = [];
    let text = '';
    try { text = fs.readFileSync(this.f(n), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    text.split('\n').forEach((line, i) => {
      if (!line) return;
      try { rows.push(JSON.parse(line)); } catch { console.warn(`store: skipped corrupt line ${i + 1} in ${n}.jsonl`); }
    });
    // A crash mid-append can leave no trailing newline; repair so the next append starts on its own line.
    if (text && !text.endsWith('\n')) fs.appendFileSync(this.f(n), '\n', { mode: 0o600 });
    this.cache.set(n, rows);
    return rows;
  }

  read(n) { return this.load(n).slice(); }

  append(n, o) {
    const rows = this.load(n);
    fs.appendFileSync(this.f(n), JSON.stringify(o) + '\n', { mode: 0o600 });
    rows.push(o);
  }

  // Atomic replace: write temp file, fsync, rename.
  write(n, rows) {
    const t = this.f(n) + '.tmp';
    const fd = fs.openSync(t, 'w', 0o600);
    try {
      fs.writeSync(fd, rows.map(r => JSON.stringify(r) + '\n').join(''));
      fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
    fs.renameSync(t, this.f(n));
    this.cache.set(n, rows.slice());
  }

  id() { return crypto.randomBytes(8).toString('hex'); }
  hash(phone, salt) { return crypto.createHash('sha256').update(salt + phone).digest('hex').slice(0, 16); }
}
module.exports = { Store };
