'use strict';
// D1-backed store. Collections mirror the JSONL files in server/store.js:
// each row is a JSON blob in `items`, read whole and filtered in JS (the
// dataset is hundreds of rows, so this stays cheap and faithful to the
// original semantics). wa_stats and rate_hits are real tables because they
// need atomic increments; rsvp_dedup enforces RSVP idempotency under races.
import { rid } from './util.mjs';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS items (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    collection TEXT NOT NULL,
    id TEXT,
    data TEXT NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_items_collection ON items(collection, seq)',
  `CREATE TABLE IF NOT EXISTS wa_stats (
    day TEXT NOT NULL,
    kind TEXT NOT NULL,
    n INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, kind)
  )`,
  'CREATE TABLE IF NOT EXISTS rate_hits (key TEXT NOT NULL, ts INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_rate_hits ON rate_hits(key, ts)',
  'CREATE TABLE IF NOT EXISTS rsvp_dedup (event TEXT NOT NULL, phone TEXT NOT NULL, PRIMARY KEY (event, phone))',
];

const ready = new WeakMap();
export function ensureSchema(env) {
  let p = ready.get(env.DB);
  if (!p) {
    p = env.DB.batch(SCHEMA.map(s => env.DB.prepare(s)))
      .catch(e => { ready.delete(env.DB); throw e; });
    ready.set(env.DB, p);
  }
  return p;
}

export async function read(env, collection) {
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT data FROM items WHERE collection = ? ORDER BY seq').bind(collection).all();
  return (r.results || []).map(x => JSON.parse(x.data));
}

export async function append(env, collection, obj) {
  await ensureSchema(env);
  await env.DB.prepare('INSERT INTO items (collection, id, data) VALUES (?, ?, ?)')
    .bind(collection, obj.id ?? null, JSON.stringify(obj)).run();
}

// Atomic replace of a whole collection (used by purge/erase).
export async function write(env, collection, rows) {
  await ensureSchema(env);
  const stmts = [env.DB.prepare('DELETE FROM items WHERE collection = ?').bind(collection)];
  for (const r of rows) {
    stmts.push(env.DB.prepare('INSERT INTO items (collection, id, data) VALUES (?, ?, ?)')
      .bind(collection, r.id ?? null, JSON.stringify(r)));
  }
  await env.DB.batch(stmts);
}

// Replace several collections atomically in one batch.
export async function writeAll(env, map) {
  await ensureSchema(env);
  const stmts = [];
  for (const [collection, rows] of Object.entries(map)) {
    stmts.push(env.DB.prepare('DELETE FROM items WHERE collection = ?').bind(collection));
    for (const r of rows) {
      stmts.push(env.DB.prepare('INSERT INTO items (collection, id, data) VALUES (?, ?, ?)')
        .bind(collection, r.id ?? null, JSON.stringify(r)));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------- wa_stats (atomic daily counters) ----------
export async function waBump(env, day, kind) {
  await ensureSchema(env);
  await env.DB.prepare('INSERT INTO wa_stats (day, kind, n) VALUES (?, ?, 1) ON CONFLICT(day, kind) DO UPDATE SET n = n + 1')
    .bind(day, kind).run();
}
export async function waStats(env) {
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT day, kind, n FROM wa_stats').all();
  return r.results || [];
}
export async function waStatsPrune(env, cutoffDay) {
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM wa_stats WHERE day < ?').bind(cutoffDay).run();
}

// ---------- RSVP dedup (race-safe idempotency) ----------
// Returns true if this (event, phone) was newly claimed, false if it already existed.
export async function claimRsvp(env, event, phone) {
  await ensureSchema(env);
  try {
    await env.DB.prepare('INSERT INTO rsvp_dedup (event, phone) VALUES (?, ?)').bind(event, phone).run();
    return true;
  } catch { return false; }
}
export async function releaseRsvp(env, event, phone) {
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM rsvp_dedup WHERE event = ? AND phone = ?').bind(event, phone).run();
}
// Erase all dedup rows for a phone (subject erasure).
export async function releaseRsvpsForPhone(env, phone) {
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM rsvp_dedup WHERE phone = ?').bind(phone).run();
}

// ---------- rate limiting (sliding 60s window, D1-backed so it holds across isolates) ----------
export async function rateLimited(env, key, limit) {
  await ensureSchema(env);
  const now = Date.now();
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO rate_hits (key, ts) VALUES (?, ?)').bind(key, now),
    env.DB.prepare('DELETE FROM rate_hits WHERE ts < ?').bind(now - 60000),
    env.DB.prepare('SELECT COUNT(*) AS n FROM rate_hits WHERE key = ? AND ts > ?').bind(key, now - 60000),
  ]);
  return ((res[2].results || [])[0]?.n || 0) > limit;
}
export async function pruneRateHits(env) {
  await ensureSchema(env);
  await env.DB.prepare('DELETE FROM rate_hits WHERE ts < ?').bind(Date.now() - 60000).run();
}

export { rid };
