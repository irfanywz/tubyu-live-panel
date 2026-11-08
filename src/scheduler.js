import { db } from './db.js';
import { launchTask, stopTask, addLog, getStats, isPendingRestart } from './runner.js';
import { spawnRepeats } from './repeat.js';
import { sweepOrphanLogs } from './logs.js';

const now = () => new Date().toISOString();

function failTask(taskId, message) {
  db.prepare("UPDATE tasks SET status = 'failed', last_error = ?, ended_at = ? WHERE id = ?")
    .run(message, now(), taskId);
  addLog(taskId, message);
}

export function tick() {
  const t = now();

  // 1. Masa aktif habis: hentikan yang live, batalkan yang terjadwal
  const expired = db.prepare(`
    SELECT t.id, t.status FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE u.expires_at <= ? AND t.status IN ('live', 'scheduled', 'idle')
  `).all(t);
  for (const row of expired) {
    if (row.status === 'live') stopTask(row.id, 'stopped', 'Masa aktif habis');
    else failTask(row.id, 'Masa aktif habis');
  }

  // 2. Waktu stop sudah tercapai
  const toStop = db.prepare(
    "SELECT id FROM tasks WHERE status = 'live' AND stop_at_utc IS NOT NULL AND stop_at_utc <= ?"
  ).all(t);
  for (const row of toStop) stopTask(row.id, 'finished');

  // 3. Waktu mulai sudah tercapai
  const toStart = db.prepare(`
    SELECT t.id FROM tasks t
    JOIN users u ON u.id = t.user_id
    WHERE t.status = 'scheduled' AND t.scheduled_start_utc <= ? AND u.expires_at > ? AND u.disabled = 0
  `).all(t, t);
  for (const row of toStart) {
    try {
      launchTask(row.id);
    } catch (err) {
      failTask(row.id, err.message);
    }
  }

  // 4. Watchdog: live yang tidak mengirim progres tidak boleh dibiarkan berjalan diam-diam
  const liveRows = db.prepare("SELECT id, started_at FROM tasks WHERE status = 'live'").all();
  for (const row of liveRows) {
    if (isPendingRestart(row.id)) continue;   // sedang menunggu sambung ulang, bukan macet
    const st = getStats(row.id);
    const silentFor = st ? st.age_sec : Math.round((Date.now() - Date.parse(row.started_at)) / 1000);
    const limit = st ? 60 : 90;   // tanpa progres sama sekali diberi waktu lebih lama
    if (silentFor > limit) {
      stopTask(row.id, 'failed', `FFmpeg tidak mengirim data selama ${silentFor} detik. Proses dihentikan. Cek koneksi dan lihat Log.`);
      addLog(row.id, 'Watchdog: tidak ada progres, proses dihentikan');
    }
  }

  // 5. Buat occurrence berikutnya untuk tugas berulang yang sudah selesai
  spawnRepeats(Date.now());
}

export function startScheduler(intervalMs) {
  tick();
  sweepOrphanLogs();
  setInterval(() => {
    try { sweepOrphanLogs(); } catch (err) { console.error('[logs]', err); }
  }, 3_600_000);
  return setInterval(() => {
    try {
      tick();
    } catch (err) {
      console.error('[scheduler]', err);
    }
  }, intervalMs);
}
