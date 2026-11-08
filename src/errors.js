// Mencatat error ke console dan storage/logs/server-errors.log, tanpa pernah melempar lagi.
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const DIR = path.resolve(config.storageDir, 'logs');
const FILE = path.join(DIR, 'server-errors.log');
const MAX_BYTES = 1024 * 1024;
let lastReport = 0;

export function reportError(where, err) {
  const detail = err && err.stack ? err.stack : String(err);
  console.error(`[${where}] ${err?.message || err}`);
  // Hindari banjir laporan kalau masalahnya terus berulang (misalnya disk penuh)
  const t = Date.now();
  if (t - lastReport < 60_000) return;
  lastReport = t;
  try {
    fs.mkdirSync(DIR, { recursive: true });
    try {
      if (fs.statSync(FILE).size > MAX_BYTES) fs.renameSync(FILE, FILE + '.1');
    } catch { /* belum ada */ }
    fs.appendFileSync(FILE, `${new Date().toISOString()} [${where}] ${detail}\n`);
  } catch {
    // Kalau bahkan menulis laporan gagal, tidak ada lagi tempat untuk mencatat. Biarkan.
  }
}
