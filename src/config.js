import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import 'dotenv/config';

const require = createRequire(import.meta.url);

// Urutan: FFMPEG_PATH di .env > binary dari ffmpeg-static (npm) > "ffmpeg" di PATH
function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const bundled = require('ffmpeg-static');
    if (bundled) return bundled;
  } catch { /* belum npm install */ }
  return 'ffmpeg';
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '127.0.0.1',
  dbPath: process.env.DB_PATH || path.join(root, 'data', 'app.db'),
  storageDir: process.env.STORAGE_DIR || path.join(root, 'storage'),
  ffmpegPath: resolveFfmpeg(),
  rtmpBase: process.env.RTMP_BASE || 'rtmps://a.rtmps.youtube.com:443/live2/',
  encKey: process.env.ENC_KEY || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY || '',
  tickMs: 5000,
};

// Paket yang tersedia.
// maxActive: tugas manual, terjadwal, atau live yang boleh dimiliki sekaligus.
// maxLive: tugas yang boleh berjalan bersamaan.
// Tambah paket cukup dengan menambah entri di sini.
export const PACKAGES = {
  A: { label: 'Paket A', storageBytes: 3 * 1024 ** 3, maxActive: 3, maxLive: 3 },
  B: { label: 'Paket B', storageBytes: 5 * 1024 ** 3, maxActive: 5, maxLive: 5 },
  C: { label: 'Paket C', storageBytes: 10 * 1024 ** 3, maxActive: 10, maxLive: 10 },
};
