// Pemeriksaan sistem. Dipakai oleh `npm run doctor`, `npm run setup`, dan halaman Pengaturan.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from './config.js';
import { db } from './db.js';

const CACHE_MS = 60_000;
let cache = null;

function checkNode() {
  const [maj, min] = process.versions.node.split('.').map(Number);
  const ok = maj > 22 || (maj === 22 && min >= 13);
  return { ok, detail: process.version, hint: 'Install Node.js 22.13 atau lebih baru (disarankan 24 LTS).' };
}

function checkDeps() {
  const ok = fs.existsSync(path.join(config.root, 'node_modules', 'express'));
  return { ok, detail: ok ? 'terpasang' : 'belum terpasang', hint: 'Jalankan: npm install (atau npm run setup).' };
}

function checkEnv() {
  const ok = /^[0-9a-f]{64}$/i.test(config.encKey);
  return { ok, detail: ok ? 'valid' : 'kosong atau tidak valid', hint: 'Jalankan: npm run gensecret' };
}

function checkFfmpeg() {
  const r = spawnSync(config.ffmpegPath, ['-version'], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) {
    return { ok: false, detail: `tidak bisa dijalankan: ${config.ffmpegPath}`,
      hint: 'Jalankan: npm rebuild ffmpeg-static. Kalau npm masih memblokir, isi FFMPEG_PATH di .env ke FFmpeg yang sudah terpasang.' };
  }
  const first = (r.stdout || '').split('\n')[0] || '';
  const version = first.replace(/^ffmpeg version\s+/, '').split(' ')[0];
  return { ok: true, detail: version || config.ffmpegPath };
}

function checkRtmps() {
  const r = spawnSync(config.ffmpegPath, ['-hide_banner', '-protocols'], { encoding: 'utf8', windowsHide: true });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const ok = /\brtmps\b/.test(out);
  return { ok, detail: ok ? 'didukung' : 'tidak ada di build ini',
    hint: 'Pakai build FFmpeg yang punya TLS, atau pastikan ffmpeg-static terpasang.' };
}

function checkDb() {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return { ok: true, detail: config.dbPath };
  } catch (e) {
    return { ok: false, detail: e.message, hint: 'Cek izin tulis di folder data/.' };
  }
}

function checkStorage() {
  const dirs = ['videos', 'thumbs', 'tmp'].map((d) => path.resolve(config.storageDir, d));
  try {
    for (const d of dirs) {
      fs.mkdirSync(d, { recursive: true });
      const test = path.join(d, '.write-test');
      fs.writeFileSync(test, 'ok');
      fs.rmSync(test, { force: true });
    }
    return { ok: true, detail: config.storageDir };
  } catch (e) {
    return { ok: false, detail: e.message, hint: 'Cek izin tulis di folder storage/.' };
  }
}

export function runChecks(force = false) {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.items;

  const ff = checkFfmpeg();
  const items = [
    { id: 'node', label: 'Node.js 22.13+', ...checkNode() },
    { id: 'deps', label: 'Dependency terpasang', ...checkDeps() },
    { id: 'env', label: 'ENC_KEY di .env', ...checkEnv() },
    { id: 'ffmpeg', label: 'FFmpeg', ...ff,
      hint: ff.hint },
    { id: 'rtmps', label: 'FFmpeg mendukung rtmps://',
      ...(ff.ok ? checkRtmps() : { ok: false, detail: 'FFmpeg tidak tersedia', hint: 'Perbaiki FFmpeg dulu.' }) },
    { id: 'db', label: 'Database', ...checkDb() },
    { id: 'storage', label: 'Folder storage bisa ditulis', ...checkStorage() },
  ];

  cache = { at: Date.now(), items };
  return items;
}
