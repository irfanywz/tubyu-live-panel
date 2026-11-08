import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, PACKAGES } from './config.js';
import { db } from './db.js';
import { encrypt, decrypt, hintOf } from './crypto.js';
import { TIMEZONES, isValidTz, zonedToUtcIso } from './tz.js';
import { checkLogin, failLogin, clearLogin } from './ratelimit.js';
import {
  checkPassword, hashPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, requireAuth, requireAdmin, isExpired,
} from './auth.js';
import { queueDownload, deleteFile, usedBytes, httpError } from './files.js';
import { launchTask, stopTask, addLog, isRunning, recoverOnBoot, getStats, stopAll, liveUploadKbps, liveCount } from './runner.js';
import { runChecks } from './checks.js';
import { checkQuota, limitsFor } from './limits.js';
import { readLogs, deleteLogs } from './logs.js';
import { reportError } from './errors.js';
import { startMonitor, snapshotNow } from './monitor.js';
import {
  flushBandwidth, startBandwidthFlush, bandwidthDaily, bandwidthSum, customerUsage,
  daysAgoIso, daysAgoDay, monthStartIso,
} from './bandwidth.js';
import { startScheduler } from './scheduler.js';

if (!config.encKey) {
  console.error('ENC_KEY belum ada. Jalankan: npm run gensecret');
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
if (config.trustProxy) app.set('trust proxy', Number(config.trustProxy));
app.use(express.json({ limit: '100kb' }));
// File panel sering berubah. Browser selalu memeriksa ulang supaya tidak memakai JS lama.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => new Date().toISOString();
const remainingSec = (user) => Math.max(0, Math.floor((new Date(user.expires_at) - Date.now()) / 1000));

// ---------- AUTH ----------
app.post('/api/login', wrap((req, res) => {
  const username = String(req.body?.username || '');
  const password = String(req.body?.password || '');
  const key = `${req.ip}|${username}`;

  const wait = checkLogin(key);
  if (wait) {
    return res.status(429).json({ message: `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 60)} menit.` });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !checkPassword(password, user.password_hash)) {
    failLogin(key);
    return res.status(401).json({ message: 'Username atau password salah' });
  }
  if (user.disabled) {
    return res.status(403).json({ code: 'DISABLED', message: 'Akun Anda dinonaktifkan. Hubungi admin.' });
  }
  if (isExpired(user)) {
    return res.status(403).json({
      code: 'EXPIRED',
      message: 'Masa aktif Anda sudah habis. Hubungi admin untuk perpanjangan.',
    });
  }

  clearLogin(key);
  setSessionCookie(res, createSession(user.id));
  res.json({ ok: true, role: user.role });
}));

app.post('/api/logout', (req, res) => {
  const token = (req.headers.cookie || '').match(/sid=([0-9a-f]+)/)?.[1];
  if (token) destroySession(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    username: u.username,
    role: u.role,
    expires_at: u.expires_at,
    remaining_sec: remainingSec(u),
    must_change_password: !!u.must_change_password,
    timezone: u.timezone,
    package: u.package,
    limits: { label: limitsFor(u.package).label, maxActive: limitsFor(u.package).maxActive, maxLive: limitsFor(u.package).maxLive },
    timezones: TIMEZONES,
    storage: { limit: u.storage_limit_bytes, used: usedBytes(u.id) },
  });
});

app.put('/api/settings/timezone', requireAuth, (req, res) => {
  const tz = String(req.body?.timezone || '');
  if (!isValidTz(tz)) throw httpError(400, 'Zona waktu tidak dikenal');
  db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(tz, req.user.id);
  res.json({ ok: true });
});

app.post('/api/password', requireAuth, wrap((req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!checkPassword(String(oldPassword || ''), req.user.password_hash)) {
    throw httpError(400, 'Sandi lama salah');
  }
  if (String(newPassword || '').length < 8) throw httpError(400, 'Sandi baru minimal 8 karakter');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
    .run(hashPassword(newPassword), req.user.id);
  res.json({ ok: true });
}));

// ---------- FILES ----------
app.get('/api/files', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, filename, size_bytes, status, error, source_url, created_at, thumb_path FROM files WHERE user_id = ? ORDER BY id DESC'
  ).all(req.user.id).map(({ thumb_path, ...r }) => ({ ...r, has_thumb: !!thumb_path }));
  res.json(rows);
});

app.post('/api/files', requireAuth, wrap((req, res) => {
  const id = queueDownload(req.user, String(req.body?.url || ''));
  res.status(202).json({ id });
}));

app.delete('/api/files/:id', requireAuth, wrap((req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!file) throw httpError(404, 'File tidak ditemukan');
  deleteFile(file);
  res.json({ ok: true });
}));

// ---------- TASKS ----------
const KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const REPEATS = ['none', 'daily', 'weekly'];

// Input datetime dari panel dianggap jam dinding di zona waktu user
function parseLocal(value, tz, label) {
  if (value === undefined || value === null || value === '') return null;
  const iso = zonedToUtcIso(value, tz);
  if (!iso) throw httpError(400, `${label} tidak valid`);
  return iso;
}

function serializeTask(t) {
  return {
    id: t.id,
    title: t.title,
    file_id: t.file_id,
    file_name: t.file_name,
    key_hint: t.key_hint,
    pid: t.status === 'live' ? t.pid : null,
    status: t.status,
    repeat_rule: t.repeat_rule,
    scheduled_start_utc: t.scheduled_start_utc,
    stop_at_utc: t.stop_at_utc,
    duration_sec: t.duration_sec,
    started_at: t.started_at,
    ended_at: t.ended_at,
    last_error: t.last_error,
    stats: t.status === 'live' ? getStats(t.id) : null,
    remaining_sec: t.status === 'live' && t.stop_at_utc
      ? Math.max(0, Math.floor((new Date(t.stop_at_utc) - Date.now()) / 1000)) : null,
  };
}

const TASK_SELECT = `
  SELECT t.*, f.filename AS file_name
  FROM tasks t JOIN files f ON f.id = t.file_id
`;

app.get('/api/tasks', requireAuth, (req, res) => {
  const rows = db.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND t.status IN ('idle','scheduled','live') ORDER BY t.id DESC`)
    .all(req.user.id);
  res.json(rows.map(serializeTask));
});

// Validasi terpusat untuk buat dan ubah tugas.
// Saat edit (existing != null), stream key kosong berarti tidak diganti.
function parseTask(b, user, existing) {
  const tz = user.timezone;
  const title = String(b.title || '').trim();
  if (!title || title.length > 100) throw httpError(400, 'Judul wajib diisi (maks 100 karakter)');

  const file = db.prepare("SELECT * FROM files WHERE id = ? AND user_id = ? AND status = 'ready'")
    .get(Number(b.fileId), user.id);
  if (!file) throw httpError(400, 'Pilih file video yang sudah selesai diunduh');

  const streamKey = String(b.streamKey || '').trim();
  if ((!existing || streamKey) && !KEY_RE.test(streamKey)) throw httpError(400, 'Stream key tidak valid');

  const startUtc = parseLocal(b.startAt, tz, 'Jadwal mulai');
  const stopUtc = parseLocal(b.stopAt, tz, 'Jadwal stop');
  const durationMin = Number(b.durationMin || 0);
  if (!Number.isInteger(durationMin) || durationMin < 0) throw httpError(400, 'Durasi tidak valid');
  const repeat = String(b.repeat || 'none');
  if (!REPEATS.includes(repeat)) throw httpError(400, 'Pengulangan tidak valid');

  const nowMs = Date.now();
  if (startUtc && new Date(startUtc) <= nowMs) throw httpError(400, 'Jadwal mulai sudah lewat');
  if (stopUtc && new Date(stopUtc) <= nowMs) throw httpError(400, 'Jadwal stop sudah lewat');
  if (stopUtc && startUtc && new Date(stopUtc) <= new Date(startUtc)) {
    throw httpError(400, 'Jadwal stop harus setelah jadwal mulai');
  }

  // Jadwal stop mengalahkan durasi
  const duration = stopUtc ? null : (durationMin > 0 ? durationMin * 60 : null);
  if (repeat !== 'none') {
    if (!startUtc) throw httpError(400, 'Pengulangan butuh jadwal mulai');
    if (!stopUtc && !duration) throw httpError(400, 'Pengulangan butuh jadwal stop atau auto-stop');
  }

  return {
    title, file, streamKey, startUtc, stopUtc, duration, repeat,
    status: startUtc ? 'scheduled' : 'idle',
  };
}

app.post('/api/tasks', requireAuth, wrap((req, res) => {
  const f = parseTask(req.body || {}, req.user, null);
  checkQuota({ userId: req.user.id, pkg: req.user.package, activate: true });
  const info = db.prepare(`
    INSERT INTO tasks (user_id, title, file_id, stream_key_enc, key_hint, scheduled_start_utc,
                       stop_at_utc, duration_sec, status, repeat_rule, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, f.title, f.file.id, encrypt(f.streamKey), hintOf(f.streamKey),
    f.startUtc, f.stopUtc, f.duration, f.status, f.repeat, now());

  addLog(Number(info.lastInsertRowid), `Tugas dibuat (${f.status}${f.repeat !== 'none' ? `, ulang ${f.repeat}` : ''})`);
  res.status(201).json({ id: Number(info.lastInsertRowid) });
}));

function ownTask(req) {
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!task) throw httpError(404, 'Tugas tidak ditemukan');
  return task;
}

app.patch('/api/tasks/:id', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  if (task.status === 'live' || isRunning(task.id)) {
    throw httpError(400, 'Tugas sedang live. Hentikan dulu sebelum mengubah.');
  }
  const f = parseTask(req.body || {}, req.user, task);
  checkQuota({ userId: req.user.id, pkg: req.user.package, excludeId: task.id, activate: true });
  db.prepare(`
    UPDATE tasks SET title = ?, file_id = ?, stream_key_enc = ?, key_hint = ?,
      scheduled_start_utc = ?, stop_at_utc = ?, duration_sec = ?, repeat_rule = ?, repeat_spawned = 0,
      status = ?, pid = NULL, started_at = NULL, ended_at = NULL, last_error = NULL
    WHERE id = ?
  `).run(f.title, f.file.id,
    f.streamKey ? encrypt(f.streamKey) : task.stream_key_enc,
    f.streamKey ? hintOf(f.streamKey) : task.key_hint,
    f.startUtc, f.stopUtc, f.duration, f.repeat, f.status, task.id);
  addLog(task.id, 'Tugas diubah');
  res.json({ ok: true });
}));

app.post('/api/tasks/:id/start', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  if (isRunning(task.id) || task.status === 'live') throw httpError(400, 'Tugas sudah live');

  // Tugas yang sudah selesai dijalankan ulang sebagai tugas baru agar arsip tetap utuh
  let targetId = task.id;
  if (['finished', 'stopped', 'failed'].includes(task.status)) {
    checkQuota({ userId: req.user.id, pkg: req.user.package, activate: true, goLive: true });
    const info = db.prepare(`
      INSERT INTO tasks (user_id, title, file_id, stream_key_enc, key_hint, duration_sec, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'idle', ?)
    `).run(task.user_id, task.title, task.file_id, task.stream_key_enc, task.key_hint, task.duration_sec, now());
    targetId = Number(info.lastInsertRowid);
  }
  launchTask(targetId);
  res.json({ ok: true, id: targetId });
}));

app.post('/api/tasks/:id/stop', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  if (!stopTask(task.id, 'stopped')) {
    db.prepare("UPDATE tasks SET status = 'stopped', ended_at = ? WHERE id = ? AND status IN ('idle','scheduled')")
      .run(now(), task.id);
  }
  res.json({ ok: true });
}));

app.delete('/api/tasks/:id', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  if (task.status === 'live' || isRunning(task.id)) throw httpError(400, 'Hentikan live dulu sebelum menghapus');
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  deleteLogs(task.id);
  res.json({ ok: true });
}));

app.get('/api/tasks/:id/logs', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  res.json(readLogs(task.id));
}));

// ---------- ARCHIVE ----------
app.get('/api/archive', requireAuth, (req, res) => {
  const rows = db.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND t.status IN ('finished','stopped','failed') ORDER BY t.id DESC`)
    .all(req.user.id);
  res.json(rows.map(serializeTask));
});

app.post('/api/archive/clear', requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE user_id = ? AND status IN ('finished','stopped')").run(req.user.id);
  res.json({ deleted: info.changes });
});

app.post('/api/archive/clear-errors', requireAuth, (req, res) => {
  const info = db.prepare("DELETE FROM tasks WHERE user_id = ? AND status = 'failed'").run(req.user.id);
  res.json({ deleted: info.changes });
});

// ---------- MEDIA & KEY ----------
function sendStream(req, res, file) {
  if (!file || file.status !== 'ready' || !file.path || !fs.existsSync(file.path)) {
    throw httpError(404, 'File tidak ditemukan');
  }
  const size = fs.statSync(file.path).size;
  const type = file.path.toLowerCase().endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4';

  let start = 0;
  let end = size - 1;
  let partial = false;
  const m = String(req.headers.range || '').match(/bytes=(\d*)-(\d*)/);
  if (m && (m[1] || m[2])) {
    partial = true;
    if (m[1] === '') start = Math.max(0, size - Number(m[2]));
    else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    }
    if (start > end || start >= size) {
      res.status(416).set('Content-Range', `bytes */${size}`).end();
      return;
    }
  }

  res.status(partial ? 206 : 200).set({
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    ...(partial ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
  });
  fs.createReadStream(file.path, { start, end }).pipe(res);
}

function sendThumb(res, file) {
  if (!file?.thumb_path || !fs.existsSync(file.thumb_path)) throw httpError(404, 'Thumbnail tidak ada');
  res.set('Cache-Control', 'private, max-age=3600');
  res.sendFile(path.resolve(file.thumb_path));
}

app.get('/api/files/:id/stream', requireAuth, (req, res, next) => {
  try {
    sendStream(req, res, db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id));
  } catch (err) { next(err); }
});

app.get('/api/files/:id/thumb', requireAuth, (req, res, next) => {
  try {
    sendThumb(res, db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id));
  } catch (err) { next(err); }
});

app.get('/api/admin/files/:id/stream', requireAdmin, (req, res, next) => {
  try {
    sendStream(req, res, db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

app.get('/api/admin/files/:id/thumb', requireAdmin, (req, res, next) => {
  try {
    sendThumb(res, db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id));
  } catch (err) { next(err); }
});

// Stream key hanya didekripsi saat diminta, tidak ikut di daftar tugas
app.get('/api/tasks/:id/key', requireAuth, wrap((req, res) => {
  const task = ownTask(req);
  res.json({ key: decrypt(task.stream_key_enc) });
}));

// ---------- SYSTEM ----------
app.get('/api/system', requireAuth, (req, res) => {
  res.json(runChecks().map(({ id, label, ok, detail, hint }) => ({ id, label, ok, detail, hint })));
});

// ---------- ADMIN ----------
const audit = (adminId, action, target, detail = '') =>
  db.prepare('INSERT INTO audit_logs (at, admin_id, action, target, detail) VALUES (?, ?, ?, ?, ?)')
    .run(now(), adminId, action, target, detail);

function getCustomer(id) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id));
  if (!u) throw httpError(404, 'Customer tidak ditemukan');
  if (u.role === 'admin') throw httpError(400, 'Tidak bisa mengubah akun admin dari sini');
  return u;
}

app.get('/api/admin/summary', requireAdmin, (req, res) => {
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
  res.json({
    live: count("SELECT COUNT(*) AS n FROM tasks WHERE status = 'live'"),
    scheduled: count("SELECT COUNT(*) AS n FROM tasks WHERE status = 'scheduled'"),
    errorsToday: count("SELECT COUNT(*) AS n FROM tasks WHERE status = 'failed' AND ended_at >= ?", todayStart.toISOString()),
    customers: count("SELECT COUNT(*) AS n FROM users WHERE role = 'customer'"),
    expiringSoon: count(
      "SELECT COUNT(*) AS n FROM users WHERE role = 'customer' AND disabled = 0 AND expires_at > ? AND expires_at <= ?",
      now(), soon),
  });
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.role, u.package, u.expires_at, u.disabled, u.storage_limit_bytes,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM files f WHERE f.user_id = u.id AND f.status = 'ready') AS used_bytes,
      (SELECT COUNT(*) FROM tasks t WHERE t.user_id = u.id AND t.status = 'live') AS live_count
    FROM users u ORDER BY u.id
  `).all();
  res.json(rows.map((r) => ({
    ...r,
    disabled: !!r.disabled,
    remaining_sec: Math.max(0, Math.floor((new Date(r.expires_at) - Date.now()) / 1000)),
  })));
});

app.post('/api/admin/customers/:id/extend', requireAdmin, wrap((req, res) => {
  const u = getCustomer(req.params.id);
  const hours = Number(req.body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) throw httpError(400, 'Jumlah jam tidak valid');
  const base = Math.max(new Date(u.expires_at).getTime(), Date.now());
  const expires = new Date(base + hours * 3_600_000).toISOString();
  db.prepare('UPDATE users SET expires_at = ? WHERE id = ?').run(expires, u.id);
  audit(req.user.id, 'extend', u.username, `+${hours} jam`);
  res.json({ ok: true, expires_at: expires });
}));

app.post('/api/admin/customers/:id/reset-password', requireAdmin, wrap((req, res) => {
  const u = getCustomer(req.params.id);
  const pw = String(req.body?.password || '');
  if (pw.length < 8) throw httpError(400, 'Sandi baru minimal 8 karakter');
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(pw), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  audit(req.user.id, 'reset-password', u.username);
  res.json({ ok: true });
}));

app.post('/api/admin/customers/:id/toggle', requireAdmin, wrap((req, res) => {
  const u = getCustomer(req.params.id);
  const disable = !u.disabled;
  db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disable ? 1 : 0, u.id);
  if (disable) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
    const live = db.prepare("SELECT id FROM tasks WHERE user_id = ? AND status = 'live'").all(u.id);
    for (const t of live) stopTask(t.id, 'stopped', 'Akun dinonaktifkan admin');
  }
  audit(req.user.id, disable ? 'disable' : 'enable', u.username);
  res.json({ ok: true, disabled: disable });
}));

app.post('/api/admin/customers/:id/stop-all', requireAdmin, wrap((req, res) => {
  const u = getCustomer(req.params.id);
  const live = db.prepare("SELECT id FROM tasks WHERE user_id = ? AND status = 'live'").all(u.id);
  for (const t of live) stopTask(t.id, 'stopped', 'Dihentikan admin');
  audit(req.user.id, 'stop-all', u.username, `${live.length} live`);
  res.json({ ok: true, stopped: live.length });
}));

app.get('/api/admin/audit', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT a.at, a.action, a.target, a.detail, u.username AS admin
    FROM audit_logs a LEFT JOIN users u ON u.id = a.admin_id
    ORDER BY a.id DESC LIMIT 200
  `).all();
  res.json(rows);
});

// ---------- ADMIN: CUSTOMER BARU, MONITOR LIVE, BERKAS ----------
app.post('/api/admin/customers', requireAdmin, wrap((req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const hours = Number(req.body?.hours);
  if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
    throw httpError(400, 'Username 3-32 karakter: huruf, angka, titik, strip, atau underscore');
  }
  if (password.length < 8) throw httpError(400, 'Sandi minimal 8 karakter');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) throw httpError(400, 'Masa aktif tidak valid');
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) throw httpError(400, 'Username sudah dipakai');

  const pkg = String(req.body?.package || 'A');
  if (!PACKAGES[pkg]) throw httpError(400, 'Paket tidak dikenal');

  const expires = new Date(Date.now() + hours * 3_600_000).toISOString();
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, package, storage_limit_bytes, expires_at, must_change_password, created_at, role)
    VALUES (?, ?, ?, ?, ?, 1, ?, 'customer')
  `).run(username, hashPassword(password), pkg, PACKAGES[pkg].storageBytes, expires, now());
  audit(req.user.id, 'create-customer', username, `${hours} jam, ${pkg}`);
  res.status(201).json({ id: Number(info.lastInsertRowid), expires_at: expires, package: pkg });
}));

app.post('/api/admin/customers/:id/package', requireAdmin, wrap((req, res) => {
  const u = getCustomer(req.params.id);
  const pkg = String(req.body?.package || '');
  if (!PACKAGES[pkg]) throw httpError(400, 'Paket tidak dikenal');
  // Batas baru berlaku untuk tugas berikutnya. Tugas yang sudah ada tidak dihapus.
  db.prepare('UPDATE users SET package = ?, storage_limit_bytes = ? WHERE id = ?')
    .run(pkg, PACKAGES[pkg].storageBytes, u.id);
  audit(req.user.id, 'set-package', u.username, pkg);
  res.json({ ok: true });
}));

app.get('/api/admin/live', requireAdmin, (req, res) => res.json(adminLiveRows()));

app.post('/api/admin/tasks/:id/stop', requireAdmin, wrap((req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!t) throw httpError(404, 'Tugas tidak ditemukan');
  if (!stopTask(t.id, 'stopped', 'Dihentikan admin')) throw httpError(400, 'Tugas tidak sedang live');
  audit(req.user.id, 'stop-task', String(t.id), t.title);
  res.json({ ok: true });
}));

app.get('/api/admin/files', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT f.id, f.filename, f.size_bytes, f.status, f.error, f.thumb_path, f.created_at, u.username AS owner
    FROM files f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC
  `).all();
  res.json(rows.map(({ thumb_path, ...r }) => ({ ...r, has_thumb: !!thumb_path })));
});

app.delete('/api/admin/files/:id', requireAdmin, wrap((req, res) => {
  const f = db.prepare('SELECT f.*, u.username AS owner FROM files f JOIN users u ON u.id = f.user_id WHERE f.id = ?')
    .get(req.params.id);
  if (!f) throw httpError(404, 'File tidak ditemukan');
  deleteFile(f);
  audit(req.user.id, 'delete-file', f.owner, f.filename || String(f.id));
  res.json({ ok: true });
}));

// ---------- ADMIN: MONITOR (on demand) ----------
app.get('/api/admin/monitor', requireAdmin, wrap(async (req, res) => {
  const snap = await snapshotNow();
  res.json({ ...snap, liveUploadKbps: liveUploadKbps(), liveCount: liveCount() });
}));

// ---------- ADMIN: RIWAYAT BANDWIDTH ----------
const rangeDays = (v) => Math.min(365, Math.max(1, Number(v) || 30));

app.get('/api/admin/bandwidth', requireAdmin, (req, res) => {
  const days = rangeDays(req.query.days);
  res.json({
    days,
    daily: bandwidthDaily(daysAgoIso(days)),
    total: bandwidthSum(daysAgoIso(days)),
    month: bandwidthSum(monthStartIso()),
    customers: customerUsage(daysAgoDay(days)),
  });
});

// ---------- REALTIME (Server-Sent Events) ----------
// Koneksi baru menerima "state" penuh. Setelah itu hanya "delta": tugas yang berubah, tugas yang hilang, dan urutannya.
function adminLiveRows() {
  const rows = db.prepare(`
    SELECT t.*, f.filename AS file_name, u.username AS owner
    FROM tasks t
    JOIN files f ON f.id = t.file_id
    JOIN users u ON u.id = t.user_id
    WHERE t.status = 'live' ORDER BY t.started_at
  `).all();
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    owner: t.owner,
    file_name: t.file_name,
    key_hint: t.key_hint,
    started_at: t.started_at,
    stop_at_utc: t.stop_at_utc,
    remaining_sec: t.stop_at_utc ? Math.max(0, Math.floor((new Date(t.stop_at_utc) - Date.now()) / 1000)) : null,
    stats: getStats(t.id),
  }));
}

function customerTaskRows(userId) {
  return db.prepare(`${TASK_SELECT} WHERE t.user_id = ? AND t.status IN ('idle','scheduled','live') ORDER BY t.id DESC`)
    .all(userId).map(serializeTask);
}

const streamClients = new Set();

// Bandingkan daftar baru dengan yang terakhir dikirim ke klien ini
function diffFor(client, rows) {
  const next = new Map(rows.map((r) => [r.id, JSON.stringify(r)]));
  const upsert = rows.filter((r) => client.sent.get(r.id) !== next.get(r.id));
  const remove = [...client.sent.keys()].filter((id) => !next.has(id));
  const ids = rows.map((r) => r.id);
  const orderChanged = ids.length !== client.ids.length || ids.some((id, i) => id !== client.ids[i]);
  if (!upsert.length && !remove.length && !orderChanged) return null;
  client.sent = next;
  client.ids = ids;
  return { ids, upsert, remove };
}

// Satu query per kelompok (admin, atau per user) per tick, lalu dibagikan ke semua koneksi kelompok itu
function broadcastTick() {
  if (streamClients.size === 0) return;
  const rowsByKey = new Map();
  for (const c of streamClients) {
    const key = c.role === 'admin' ? 'admin' : `user:${c.userId}`;
    if (!rowsByKey.has(key)) {
      rowsByKey.set(key, c.role === 'admin' ? adminLiveRows() : customerTaskRows(c.userId));
    }
    const delta = diffFor(c, rowsByKey.get(key));
    if (delta) c.res.write(`event: delta\ndata: ${JSON.stringify(delta)}\n\n`);
  }
}
setInterval(() => {
  try { broadcastTick(); } catch (err) { reportError('stream-tick', err); }
}, 2000);

app.get('/api/stream', requireAuth, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const rows = req.user.role === 'admin' ? adminLiveRows() : customerTaskRows(req.user.id);
  const client = { res, role: req.user.role, userId: req.user.id, sent: new Map(), ids: [] };
  for (const r of rows) client.sent.set(r.id, JSON.stringify(r));
  client.ids = rows.map((r) => r.id);
  res.write(`event: state\ndata: ${JSON.stringify(rows)}\n\n`);

  streamClients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    streamClients.delete(client);
  });
});

// ---------- ERROR HANDLER ----------
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Terjadi kesalahan di server' : err.message });
});

// ---------- BOOT ----------
// Error yang lolos tidak boleh membiarkan proses dalam keadaan tidak jelas
process.on('unhandledRejection', (err) => reportError('unhandled-rejection', err));
process.on('uncaughtException', (err) => {
  reportError('uncaught', err);
  stopAll('Server mengalami error dan dimulai ulang');
  setTimeout(() => process.exit(1), 1000);
});
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    flushBandwidth();
    stopAll('Server dihentikan');
    setTimeout(() => process.exit(0), 1500);
  });
}

recoverOnBoot();
startMonitor();
startBandwidthFlush();
startScheduler(config.tickMs);

app.listen(config.port, config.host, () => {
  console.log(`StreamFlow MVP jalan di http://${config.host}:${config.port}`);
});
