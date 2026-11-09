import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function parseDriveId(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com') return null;

  const m = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];

  const id = url.searchParams.get('id');
  return id && /^[A-Za-z0-9_-]+$/.test(id) ? id : null;
}

// Google kadang menampilkan halaman konfirmasi untuk file besar.
// Kalau itu terjadi, coba endpoint kedua dengan confirm=t.
// Ini rapuh karena Google bisa mengubah perilakunya, jadi perlu dicek ulang berkala.
async function fetchDrive(fileId) {
  const urls = [
    `https://drive.google.com/uc?export=download&id=${fileId}`,
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } });
    const type = res.headers.get('content-type') || '';
    if (res.ok && !type.includes('text/html')) return res;
    await res.text().catch(() => {});
  }
  throw new Error('Gagal mengunduh. Pastikan file sudah dibagikan sebagai "Anyone with the link".');
}

function parseFilename(disposition) {
  if (!disposition) return null;
  const m = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

const sanitize = (name) => name.replace(/[^\w.\- ]+/g, '_').slice(0, 150);
const tooBig = () => new Error('Ukuran file melebihi sisa kuota storage');

const cancelled = () => Object.assign(new Error('CANCELLED'), { cancelled: true });

export async function downloadDrive(fileId, destPath, maxBytes, opts = {}) {
  const { onProgress, isCancelled } = opts;
  const res = await fetchDrive(fileId);

  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) throw tooBig();
  if (isCancelled && isCancelled()) throw cancelled();

  const filename = sanitize(parseFilename(res.headers.get('content-disposition')) || `${fileId}.mp4`);

  let size = 0;
  const body = Readable.fromWeb(res.body);
  if (onProgress) onProgress(0, declared);
  body.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) body.destroy(tooBig());
    if (isCancelled && isCancelled()) body.destroy(cancelled());
    if (onProgress) onProgress(size, declared);
  });

  await pipeline(body, fs.createWriteStream(destPath));
  return { filename, size };
}
