// Pengulangan jadwal: saat sebuah tugas berulang selesai, buat occurrence berikutnya.
import { db } from './db.js';
import { addLog } from './runner.js';
import { checkQuota } from './limits.js';

const STEP_MS = { daily: 86_400_000, weekly: 7 * 86_400_000 };

export function spawnRepeats(nowMs) {
  const rows = db.prepare(`
    SELECT t.*, u.expires_at AS user_expires_at, u.package AS user_package
    FROM tasks t JOIN users u ON u.id = t.user_id
    WHERE t.repeat_rule != 'none' AND t.repeat_spawned = 0
      AND t.status IN ('finished', 'stopped', 'failed')
      AND t.scheduled_start_utc IS NOT NULL
  `).all();

  for (const t of rows) {
    // Tandai dulu supaya tidak dobel walau ada error di tengah jalan
    db.prepare('UPDATE tasks SET repeat_spawned = 1 WHERE id = ?').run(t.id);

    if (new Date(t.user_expires_at).getTime() <= nowMs) continue;

    const step = STEP_MS[t.repeat_rule];
    const startBase = new Date(t.scheduled_start_utc).getTime();

    // Durasi tetap dipakai kalau ada, kalau tidak pakai selisih jadwal start-stop
    let span = null;
    if (t.duration_sec) span = t.duration_sec * 1000;
    else if (t.stop_at_utc) span = new Date(t.stop_at_utc).getTime() - startBase;
    if (!span || span <= 0) continue;

    try {
      checkQuota({ userId: t.user_id, pkg: t.user_package, activate: true });
    } catch (err) {
      addLog(t.id, `Pengulangan dilewati: ${err.message}`);
      continue;
    }

    let nextStart = startBase + step;
    while (nextStart <= nowMs) nextStart += step;
    const nextStop = t.duration_sec ? null : new Date(nextStart + span).toISOString();

    const info = db.prepare(`
      INSERT INTO tasks (user_id, title, file_id, stream_key_enc, key_hint,
                         scheduled_start_utc, stop_at_utc, duration_sec, status, repeat_rule, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)
    `).run(t.user_id, t.title, t.file_id, t.stream_key_enc, t.key_hint,
      new Date(nextStart).toISOString(), nextStop, t.duration_sec, t.repeat_rule, new Date().toISOString());

    addLog(Number(info.lastInsertRowid), `Pengulangan ${t.repeat_rule} dari tugas #${t.id}`);
  }
}
