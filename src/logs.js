// Log tugas disimpan sebagai file teks per tugas di storage/logs/<id>.log.
// Ditulis dengan append, dipangkas saat melewati MAX_BYTES, dan dihapus bersama tugasnya.
// Database tidak terlibat, jadi file SQLite tidak membengkak karena log.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { db } from './db.js';
import { reportError } from './errors.js';

const LOG_DIR = path.resolve(config.storageDir, 'logs');
const MAX_BYTES = 512 * 1024;   // ukuran maksimal per file sebelum dipangkas
const KEEP_LINES = 300;         // baris yang dipertahankan saat dipangkas
const CHECK_EVERY = 50;         // ukuran file dicek setiap N penulisan

fs.mkdirSync(LOG_DIR, { recursive: true });

const fileOf = (taskId) => path.join(LOG_DIR, `${Number(taskId)}.log`);
const writes = new Map();       // taskId -> penulisan sejak pengecekan terakhir
const lastMsg = new Map();      // taskId -> pesan terakhir, untuk membuang duplikat berurutan

function trimIfNeeded(taskId) {
  const f = fileOf(taskId);
  let size;
  try { size = fs.statSync(f).size; } catch { return; }
  if (size <= MAX_BYTES) return;
  const lines = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean);
  fs.writeFileSync(f, lines.slice(-KEEP_LINES).join('\n') + '\n');
}

export function appendLog(taskId, message) {
  const msg = String(message).replace(/\r?\n/g, ' ').slice(0, 500);
  if (lastMsg.get(taskId) === msg) return;
  lastMsg.set(taskId, msg);

  try {
    fs.appendFileSync(fileOf(taskId), `${new Date().toISOString()}\t${msg}\n`);
  } catch (err) {
    // Disk penuh atau izin salah. Jangan sampai ini menghentikan live.
    reportError('log-write', err);
    return;
  }

  const n = (writes.get(taskId) || 0) + 1;
  if (n >= CHECK_EVERY) {
    writes.set(taskId, 0);
    try { trimIfNeeded(taskId); } catch (err) { reportError('log-trim', err); }
  } else {
    writes.set(taskId, n);
  }
}

// Baris terakhir, urut dari yang lama ke yang baru
export function readLogs(taskId, limit = 200) {
  let text;
  try { text = fs.readFileSync(fileOf(taskId), 'utf8'); } catch { return []; }
  return text.split('\n').filter(Boolean).slice(-limit).map((line) => {
    const i = line.indexOf('\t');
    return i < 0 ? { at: null, message: line } : { at: line.slice(0, i), message: line.slice(i + 1) };
  });
}

export function deleteLogs(taskId) {
  fs.rmSync(fileOf(taskId), { force: true });
  lastMsg.delete(taskId);
  writes.delete(taskId);
}

// Hapus file log yang tugasnya sudah tidak ada, misalnya setelah hapus arsip massal
export function sweepOrphanLogs() {
  const ids = new Set(db.prepare('SELECT id FROM tasks').all().map((r) => String(r.id)));
  for (const name of fs.readdirSync(LOG_DIR)) {
    if (!name.endsWith('.log')) continue;
    if (!ids.has(name.slice(0, -4))) fs.rmSync(path.join(LOG_DIR, name), { force: true });
  }
}
