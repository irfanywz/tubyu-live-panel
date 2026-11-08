// Batas tugas per paket. Dipanggil dari route dan dari runner, jadi aturannya sama di mana pun tugas dimulai.
import { db } from './db.js';
import { PACKAGES } from './config.js';
import { httpError } from './files.js';

export const limitsFor = (pkg) => PACKAGES[pkg] || PACKAGES.A;

/**
 * Memeriksa kuota sebelum tugas dibuat atau dijalankan.
 * excludeId: tugas yang sedang diproses, supaya tidak dihitung dua kali.
 * activate: tugas akan menjadi aktif (manual/terjadwal/live) dan menambah hitungan aktif.
 * goLive: tugas akan berjalan dan menambah hitungan live.
 */
export function checkQuota({ userId, pkg, excludeId = -1, activate = false, goLive = false }) {
  const lim = limitsFor(pkg);
  const r = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('idle','scheduled','live') THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END), 0) AS live
    FROM tasks WHERE user_id = ? AND id <> ?
  `).get(userId, excludeId);

  if (activate && r.active + 1 > lim.maxActive) {
    throw httpError(400,
      `Batas tugas aktif ${lim.label} tercapai (${lim.maxActive}). Hapus tugas yang belum jalan, atau tunggu tugas selesai.`);
  }
  if (goLive && r.live + 1 > lim.maxLive) {
    throw httpError(400,
      `Batas live bersamaan ${lim.label} tercapai (${lim.maxLive}). Hentikan salah satu live yang sedang berjalan dulu.`);
  }
}

export function usageFor(userId) {
  return db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status IN ('idle','scheduled','live') THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END), 0) AS live
    FROM tasks WHERE user_id = ?
  `).get(userId);
}
