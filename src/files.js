import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { db } from './db.js';
import { config } from './config.js';
import { parseDriveId, downloadDrive } from './drive.js';

const ALLOWED_EXT = ['.mp4', '.mkv'];
const cancelRequests = new Set();

export const httpError = (status, message) => Object.assign(new Error(message), { status });

export function cancelDownload(file) {
  if (file.status !== 'downloading') throw httpError(400, 'Unduhan sudah selesai');
  cancelRequests.add(file.id);
}

export function usedBytes(userId) {
  return db.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) AS total FROM files WHERE user_id = ? AND status = 'ready'"
  ).get(userId).total;
}

export function queueDownload(user, url) {
  const gdriveId = parseDriveId(url);
  if (!gdriveId) throw httpError(400, 'URL Google Drive tidak valid');

  const remaining = user.storage_limit_bytes - usedBytes(user.id);
  if (remaining <= 0) throw httpError(400, 'Kuota storage sudah penuh');

  const info = db.prepare(
    "INSERT INTO files (user_id, gdrive_id, source_url, status, created_at) VALUES (?, ?, ?, 'downloading', ?)"
  ).run(user.id, gdriveId, url, new Date().toISOString());
  const fileId = Number(info.lastInsertRowid);

  processDownload(fileId, user.id, gdriveId, remaining);
  return fileId;
}

// Ambil satu frame di detik ke-2 sebagai thumbnail. Gagal pun tidak masalah, cuma tanpa thumbnail.
function makeThumb(videoPath, thumbPath) {
  return new Promise((resolve) => {
    const p = spawn(config.ffmpegPath, [
      '-hide_banner', '-loglevel', 'error',
      '-ss', '2', '-i', videoPath,
      '-frames:v', '1', '-vf', 'scale=480:-2', '-y', thumbPath,
    ], { windowsHide: true });
    const timer = setTimeout(() => p.kill(), 30_000);
    p.on('error', () => { clearTimeout(timer); resolve(false); });
    p.on('exit', (code) => { clearTimeout(timer); resolve(code === 0 && fs.existsSync(thumbPath)); });
  });
}

async function processDownload(fileId, userId, gdriveId, maxBytes) {
  const videoDir = path.resolve(config.storageDir, 'videos');
  const thumbDir = path.resolve(config.storageDir, 'thumbs');
  const tmpDir = path.resolve(config.storageDir, 'tmp');
  for (const d of [videoDir, thumbDir, tmpDir]) fs.mkdirSync(d, { recursive: true });
  const tmpPath = path.join(tmpDir, `${fileId}.part`);

  // Progres ditulis ke database paling sering tiap detik
  let lastWrite = 0;
  const onProgress = (done, total) => {
    const t = Date.now();
    if (t - lastWrite < 1000 && done !== total) return;
    lastWrite = t;
    db.prepare('UPDATE files SET progress_bytes = ?, total_bytes = ? WHERE id = ?').run(done, total || 0, fileId);
  };
  const isCancelled = () => cancelRequests.has(fileId);

  try {
    const { filename, size } = await downloadDrive(gdriveId, tmpPath, maxBytes, { onProgress, isCancelled });
    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) throw new Error('Format file harus .mp4 atau .mkv');

    const finalPath = path.join(videoDir, `${userId}-${fileId}-${filename}`);
    fs.renameSync(tmpPath, finalPath);

    const thumbPath = path.join(thumbDir, `${fileId}.jpg`);
    const hasThumb = await makeThumb(finalPath, thumbPath);

    db.prepare(`UPDATE files SET status = 'ready', filename = ?, path = ?, size_bytes = ?, thumb_path = ?, error = NULL WHERE id = ?`)
      .run(filename, finalPath, size, hasThumb ? thumbPath : null, fileId);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    cancelRequests.delete(fileId);
    if (err.cancelled) {
      // Dibatalkan pengguna: catatannya dihapus, tidak dihitung sebagai gagal
      db.prepare('DELETE FROM files WHERE id = ?').run(fileId);
      return;
    }
    db.prepare("UPDATE files SET status = 'failed', error = ? WHERE id = ?").run(err.message, fileId);
  }
}

export function deleteFile(file) {
  const inUse = db.prepare(
    "SELECT COUNT(*) AS n FROM tasks WHERE file_id = ? AND status IN ('idle','scheduled','live')"
  ).get(file.id).n;
  if (inUse) throw httpError(400, 'File dipakai oleh tugas yang belum selesai');

  db.prepare("DELETE FROM tasks WHERE file_id = ? AND status IN ('finished','stopped','failed')").run(file.id);
  if (file.path) fs.rmSync(file.path, { force: true });
  if (file.thumb_path) fs.rmSync(file.thumb_path, { force: true });
  db.prepare('DELETE FROM files WHERE id = ?').run(file.id);
}
