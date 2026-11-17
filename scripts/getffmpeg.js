// npm run getffmpeg: unduh binary FFmpeg ke storage/bin.
// Dipakai kalau FFmpeg belum tersedia di sistem dan FFMPEG_PATH tidak diisi.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadFfmpeg, ffmpegRuns, downloadedFfmpegPath } from '../src/ffmpeg-dl.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const fmtMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  const dest = downloadedFfmpegPath(root);
  if (ffmpegRuns(dest)) {
    console.log('FFmpeg hasil unduhan sudah ada dan bisa dijalankan, dilewati.');
    return;
  }
  console.log('Mengunduh FFmpeg (sekitar 80 MB)...');
  const r = await downloadFfmpeg(root, {
    onProgress: (size, declared) => {
      const pct = declared ? ` (${Math.round((size / declared) * 100)}%)` : '';
      process.stdout.write(`\r  ${fmtMB(size)}${pct}   `);
    },
  });
  process.stdout.write('\n');
  console.log(`FFmpeg tersimpan di ${r.path}${r.skipped ? '' : ` (${fmtMB(r.size || 0)})`}.`);
  console.log('Jalankan: npm run doctor');
}

main().catch((e) => {
  console.error(`\n${e.message}`);
  console.error('Alternatif: pasang FFmpeg sistem lalu isi FFMPEG_PATH di .env, atau jalankan panel lewat Docker.');
  process.exit(1);
});
