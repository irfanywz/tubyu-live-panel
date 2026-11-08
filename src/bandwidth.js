// Riwayat bandwidth untuk analisa.
// - bandwidth_5m: total upload dan download server per interval 5 menit.
// - usage_customer_daily: data yang dikirim live per customer per hari.
// Penulisan dikumpulkan di memori dan di-flush tiap 60 detik supaya database tidak ditulis terlalu sering.
import { db } from './db.js';
import { reportError } from './errors.js';

const BUCKET_MS = 5 * 60_000;
const FLUSH_MS = 60_000;
const pendingBw = new Map();     // bucket -> { up, down }
const pendingCustomer = new Map(); // "day|userId" -> { day, userId, bytes }

const bucketOf = (ms) => new Date(Math.floor(ms / BUCKET_MS) * BUCKET_MS).toISOString();
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export function addBandwidth(upBytes, downBytes) {
  if (!upBytes && !downBytes) return;
  const k = bucketOf(Date.now());
  const p = pendingBw.get(k) || { up: 0, down: 0 };
  p.up += upBytes;
  p.down += downBytes;
  pendingBw.set(k, p);
}

export function recordCustomerSent(userId, bytes) {
  if (!bytes) return;
  const day = dayOf(Date.now());
  const key = `${day}|${userId}`;
  const p = pendingCustomer.get(key) || { day, userId, bytes: 0 };
  p.bytes += bytes;
  pendingCustomer.set(key, p);
}

export function flushBandwidth() {
  const upsertBw = db.prepare(`
    INSERT INTO bandwidth_5m (bucket, up_bytes, down_bytes) VALUES (?, ?, ?)
    ON CONFLICT(bucket) DO UPDATE SET
      up_bytes = up_bytes + excluded.up_bytes,
      down_bytes = down_bytes + excluded.down_bytes
  `);
  const upsertCust = db.prepare(`
    INSERT INTO usage_customer_daily (day, user_id, sent_bytes) VALUES (?, ?, ?)
    ON CONFLICT(day, user_id) DO UPDATE SET sent_bytes = sent_bytes + excluded.sent_bytes
  `);
  db.exec('BEGIN');
  try {
    for (const [k, p] of pendingBw) upsertBw.run(k, p.up, p.down);
    for (const p of pendingCustomer.values()) upsertCust.run(p.day, p.userId, p.bytes);
    db.exec('COMMIT');
    pendingBw.clear();
    pendingCustomer.clear();
  } catch (err) {
    db.exec('ROLLBACK');
    reportError('bandwidth-flush', err);
  }
}

export function startBandwidthFlush() {
  const timer = setInterval(() => {
    try { flushBandwidth(); } catch (err) { reportError('bandwidth-flush', err); }
  }, FLUSH_MS);
  timer.unref();
}

// ----- pembacaan untuk admin -----
export function bandwidthDaily(sinceIso) {
  return db.prepare(`
    SELECT substr(bucket, 1, 10) AS day, SUM(up_bytes) AS up, SUM(down_bytes) AS down
    FROM bandwidth_5m WHERE bucket >= ? GROUP BY day ORDER BY day
  `).all(sinceIso);
}

export function bandwidthSum(sinceIso) {
  return db.prepare(`
    SELECT COALESCE(SUM(up_bytes), 0) AS up, COALESCE(SUM(down_bytes), 0) AS down
    FROM bandwidth_5m WHERE bucket >= ?
  `).get(sinceIso);
}

export function customerUsage(sinceDay) {
  return db.prepare(`
    SELECT u.username, SUM(c.sent_bytes) AS bytes
    FROM usage_customer_daily c JOIN users u ON u.id = c.user_id
    WHERE c.day >= ? GROUP BY u.id ORDER BY bytes DESC
  `).all(sinceDay);
}

export const daysAgoIso = (days) => new Date(Date.now() - days * 86_400_000).toISOString();
export const daysAgoDay = (days) => dayOf(Date.now() - days * 86_400_000);
export function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}
