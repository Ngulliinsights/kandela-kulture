'use strict';
// Shared helpers, ported from server/app.js. Web-platform APIs only.
export const DAY = 86400000;
export const NOTICE = '2026-10';

export function normPhone(s) {
  if (typeof s !== 'string') return null;
  let d = s.replace(/[\s\-().]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('254')) { d = d.slice(3); if (d.startsWith('0')) d = d.slice(1); }
  else if (d.startsWith('0')) d = d.slice(1);
  else return null;
  return /^[17]\d{8}$/.test(d) ? '+254' + d : null;
}

export const clean = (s, n) => typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) : '';

// CSV cell: neutralise spreadsheet formulas (but keep +254… phones intact) and quote when needed.
export const csvCell = v => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{6,15}$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v))) ? d : Number(v);

export function rid() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function sha256hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time-ish compare of two hex digests (equal length, no early exit on content).
export function hexEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
