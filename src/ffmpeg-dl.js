// Unduh binary FFmpeg ke storage/bin: inilah FFmpeg bawaan panel.
// Dijalankan otomatis oleh setup kalau tidak ada FFmpeg di FFMPEG_PATH atau PATH,
// atau manual lewat npm run getffmpeg.
// Sumber: rilis GitHub eugeneware/ffmpeg-static, satu file binary jadi,
// jadi tidak perlu ekstrak zip atau tar, dan tidak ada skrip install yang bisa diblokir npm.
// Catatan: binary ini bisa tetap segfault di sandbox tertentu (misalnya Cloud Shell);
// di tempat seperti itu pakai FFmpeg sistem (FFMPEG_PATH) atau Docker.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Tag rilis dicoba berurutan. Kalau satu tidak ada, coba yang berikutnya.
const RELEASE_TAGS = ['b7.0', 'b6.0', 'b5.0.1'];

// Nama file binary di rilis sesuai sistem. null kalau sistem tidak dikenal.
function assetName() {
  const map = {
    'win32-x64': 'ffmpeg-win32-x64.exe',
    'win32-arm64': 'ffmpeg-win32-arm64.exe',
    'linux-x64': 'ffmpeg-linux-x64',
    'linux-arm64': 'ffmpeg-linux-arm64',
    'darwin-x64': 'ffmpeg-darwin-x64',
    'darwin-arm64': 'ffmpeg-darwin-arm64',
  };
  return map[`${process.platform}-${process.arch}`] || null;
}

// Lokasi binary hasil unduhan: storage/bin/ffmpeg (atau ffmpeg.exe di Windows).
export function downloadedFfmpegPath(root) {
  return path.join(root, 'storage', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
}

// Coba jalankan `ffmpeg -version`. true kalau binary benar-benar bisa dijalankan.
export function ffmpegRuns(ffmpegPath) {
  const r = spawnSync(ffmpegPath, ['-version'], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}

export async function downloadFfmpeg(root, { onProgress } = {}) {
  const dest = downloadedFfmpegPath(root);
  if (ffmpegRuns(dest)) return { path: dest, skipped: true };

  const asset = assetName();
  if (!asset) {
    throw new Error(`Sistem ${process.platform}-${process.arch} tidak didukung. Pasang FFmpeg sendiri, lalu isi FFMPEG_PATH di .env.`);
  }

  let res = null;
  let lastErr = null;
  for (const tag of RELEASE_TAGS) {
    try {
      const r = await fetch(`https://github.com/eugeneware/ffmpeg-static/releases/download/${tag}/${asset}`, { redirect: 'follow' });
      if (r.ok && r.body) { res = r; break; }
      if (r.body) await r.body.cancel().catch(() => {});
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  if (!res) {
    throw new Error(`Gagal mengunduh FFmpeg (${lastErr?.message || 'tidak ada sumber yang bisa dipakai'}). Cek koneksi internet.`);
  }

  const declared = Number(res.headers.get('content-length') || 0);
  let size = 0;
  const body = Readable.fromWeb(res.body);
  if (onProgress) onProgress(0, declared);
  body.on('data', (chunk) => {
    size += chunk.length;
    if (onProgress) onProgress(size, declared);
  });

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.download`;
  try {
    await pipeline(body, fs.createWriteStream(tmp));
    fs.rmSync(dest, { force: true });
    fs.renameSync(tmp, dest);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);

  if (!ffmpegRuns(dest)) {
    fs.rmSync(dest, { force: true });
    throw new Error('FFmpeg hasil unduhan tidak bisa dijalankan di sistem ini. Pasang FFmpeg sistem (misalnya: apt install ffmpeg), lalu isi FFMPEG_PATH di .env.');
  }
  return { path: dest, size };
}
