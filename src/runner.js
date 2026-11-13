import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { config } from './config.js';
import { db } from './db.js';
import { decrypt } from './crypto.js';
import { httpError } from './files.js';
import { friendlyError } from './ffmpeg-errors.js';
import { checkQuota } from './limits.js';
import { appendLog } from './logs.js';
import { reportError } from './errors.js';
import { recordCustomerSent } from './bandwidth.js';

export const addLog = appendLog;

// taskId -> { child, stopReason, errorMessage, recent, pending, stats }
const running = new Map();

// Auto-restart: kalau FFmpeg putus tanpa diminta, sambung ulang dengan jeda bertahap.
const RECONNECT_DELAYS = [5, 15, 30, 60, 120];  // detik, per percobaan
const MAX_RECONNECTS = 5;                        // per rangkaian putus
const STABLE_MS = 10 * 60_000;                   // jalan selama ini dianggap stabil, hitungan direset
const retryState = new Map();                    // taskId -> { attempts }
const pendingRestart = new Map();                // taskId -> { timer }
export const isPendingRestart = (taskId) => pendingRestart.has(taskId);

const RECENT_LINES = 40;

const now = () => new Date().toISOString();

export const isRunning = (taskId) => running.has(taskId);

// Event handler FFmpeg dibungkus supaya error DB atau log tidak membunuh proses
const guard = (label, fn) => (...args) => {
  try { fn(...args); } catch (err) { reportError(label, err); }
};

// Total bitrate yang sedang dikirim ke YouTube oleh semua live yang berjalan (kbps)
export function liveUploadKbps() {
  let sum = 0;
  for (const entry of running.values()) {
    const b = entry.stats?.bitrate;
    if (b) sum += parseFloat(b) || 0;
  }
  return Math.round(sum);
}

export function liveCount() {
  return running.size;
}

export function getStats(taskId) {
  const s = running.get(taskId)?.stats;
  if (!s) return null;
  return { ...s, age_sec: Math.round((Date.now() - s.updatedAt) / 1000) };
}

function loadTask(taskId) {
  return db.prepare(`
    SELECT t.*, f.path AS file_path, f.status AS file_status, u.expires_at AS user_expires_at, u.package AS user_package
    FROM tasks t
    JOIN files f ON f.id = t.file_id
    JOIN users u ON u.id = t.user_id
    WHERE t.id = ?
  `).get(taskId);
}

// Output "-progress pipe:1" berupa baris key=value, dan satu blok diakhiri "progress=..."
function parseProgress(entry, line) {
  const eq = line.indexOf('=');
  if (eq < 0) return;
  const key = line.slice(0, eq);
  const value = line.slice(eq + 1);
  if (key !== 'progress') {
    entry.pending[key] = value;
    return;
  }
  const p = entry.pending;
  entry.pending = {};
  entry.stats = {
    bitrate: p.bitrate && p.bitrate !== 'N/A' ? p.bitrate.replace('kbits/s', ' kbps') : null,
    speed: p.speed && p.speed !== 'N/A' ? p.speed.trim() : null,
    out_sec: p.out_time_us && !Number.isNaN(Number(p.out_time_us)) ? Math.floor(Number(p.out_time_us) / 1e6) : null,
    total_size: Number(p.total_size) || null,
    updatedAt: Date.now(),
  };
}

// Dipanggil saat FFmpeg sudah mengirim data. Di sini timer auto-stop mulai dihitung.
function onConnected(taskId) {
  const t = loadTask(taskId);
  if (!t) return;
  const nowIso = now();
  if (t.duration_sec && !t.stop_at_utc) {
    const stop = new Date(Date.now() + t.duration_sec * 1000).toISOString();
    db.prepare('UPDATE tasks SET stop_at_utc = ?, started_at = ? WHERE id = ?').run(stop, nowIso, taskId);
  } else {
    db.prepare('UPDATE tasks SET started_at = ? WHERE id = ?').run(nowIso, taskId);
  }
  addLog(taskId, 'Tersambung ke YouTube. Timer dimulai.');
}

export function launchTask(taskId, { resume = false } = {}) {
  const task = loadTask(taskId);
  if (!task) throw httpError(404, 'Tugas tidak ditemukan');
  if (isRunning(taskId)) return;
  if (new Date(task.user_expires_at) <= new Date()) throw httpError(403, 'Masa aktif habis');
  if (task.file_status !== 'ready') throw httpError(400, 'File video belum siap');
  checkQuota({ userId: task.user_id, pkg: task.user_package, excludeId: taskId, goLive: true });
  // Key yang sama tidak boleh sedang live di tugas lain
  if (task.key_hash) {
    const dup = db.prepare("SELECT id FROM tasks WHERE key_hash = ? AND status = 'live' AND id <> ?").get(task.key_hash, taskId);
    if (dup) throw httpError(400, 'Stream key ini sedang live di tugas lain. Hentikan live tersebut dulu.');
  }

  // Timer auto-stop dimulai saat FFmpeg benar-benar tersambung (lihat onConnected)

  const streamKey = decrypt(task.stream_key_enc);
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'warning',
    '-progress', 'pipe:1', '-stats_period', '2',
    '-re', '-stream_loop', '-1', '-i', task.file_path,
    '-c', 'copy', '-f', 'flv',
    config.rtmpBase + streamKey,
  ];

  if (!resume) retryState.delete(taskId);
  const child = spawn(config.ffmpegPath, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { child, stopReason: null, errorMessage: null, recent: [], pending: {}, stats: null, startedAt: Date.now() };
  running.set(taskId, entry);

  if (resume) {
    // Sambung ulang: waktu mulai asli dipertahankan supaya progres auto-stop tetap benar
    db.prepare("UPDATE tasks SET status = 'live', pid = ?, ended_at = NULL, last_error = NULL WHERE id = ?")
      .run(child.pid ?? null, taskId);
  } else {
    db.prepare("UPDATE tasks SET status = 'live', pid = ?, started_at = ?, ended_at = NULL, last_error = NULL WHERE id = ?")
      .run(child.pid ?? null, now(), taskId);
    const shown = args.map((a) => (a === config.rtmpBase + streamKey ? config.rtmpBase + '****' : a));
  addLog(taskId, `Menjalankan: ${config.ffmpegPath} ${shown.join(' ')} (pid ${child.pid ?? '-'})`);
  addLog(taskId, 'Live dimulai');
  }

  let outBuf = '';
  child.stdout.on('data', guard('ffmpeg-stdout', (buf) => {
    outBuf += buf.toString();
    let idx;
    while ((idx = outBuf.indexOf('\n')) >= 0) {
      parseProgress(entry, outBuf.slice(0, idx).trim());
      outBuf = outBuf.slice(idx + 1);
      // Progres pertama berarti data sudah mengalir ke YouTube
      if (entry.stats && !entry.connected) {
        entry.connected = true;
        onConnected(taskId);
      }
    }
  }));

  child.stderr.on('data', guard('ffmpeg-stderr', (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line.trim()) continue;
      entry.recent.push(line.trim());
      if (entry.recent.length > RECENT_LINES) entry.recent.shift();
      addLog(taskId, line.trim());
    }
  }));

  child.on('error', guard('ffmpeg-error', (err) => {
    entry.errorMessage = err.code === 'ENOENT'
      ? 'FFmpeg tidak ditemukan. Jalankan npm run setup atau isi FFMPEG_PATH di .env.'
      : `Gagal menjalankan FFmpeg: ${err.message}`;
    running.delete(taskId);
    db.prepare("UPDATE tasks SET status = 'failed', pid = NULL, ended_at = ?, last_error = ? WHERE id = ?")
      .run(now(), entry.errorMessage, taskId);
    addLog(taskId, entry.errorMessage);
  }));

  child.on('exit', guard('ffmpeg-exit', (code, signal) => {
    if (!running.has(taskId)) return;
    running.delete(taskId);

    // Data yang sudah dikirim proses ini dicatat ke riwayat customer, walau akan disambung ulang
    const sentNow = entry.stats?.total_size || 0;
    if (sentNow) {
      const owner = db.prepare('SELECT user_id FROM tasks WHERE id = ?').get(taskId);
      if (owner) recordCustomerSent(owner.user_id, sentNow);
    }

    // Putus tanpa diminta: coba sambung ulang dulu
    if (!entry.stopReason && !entry.errorMessage && scheduleReconnect(taskId, code, entry)) return;

    const latest = loadTask(taskId);
    const pastStop = !!(latest && latest.stop_at_utc && new Date(latest.stop_at_utc) <= new Date());
    const status = entry.stopReason || (pastStop ? 'finished' : 'failed');
    let lastError = null;
    if (entry.errorMessage) lastError = entry.errorMessage;
    else if (status === 'failed') {
      if (code === null && signal) {
        // Proses dimatikan dari luar, bukan karena error FFmpeg
        lastError = `FFmpeg dihentikan oleh sistem (sinyal ${signal}). Biasanya karena kehabisan memori, proses dibunuh oleh sistem, atau sesi terminal ditutup.`;
      } else {
        lastError = friendlyError(entry.recent) || `FFmpeg berhenti tidak terduga (kode ${code}). Lihat Log untuk detail.`;
      }
    }
    retryState.delete(taskId);

    db.prepare('UPDATE tasks SET status = ?, pid = NULL, ended_at = ?, last_error = ? WHERE id = ?')
      .run(status, now(), lastError, taskId);
    addLog(taskId, `Live berhenti: ${status} (kode ${code ?? '-'}, sinyal ${signal ?? '-'})${lastError ? ` · ${lastError}` : ''}`);
  }));
}

// Mengembalikan true kalau sambung ulang dijadwalkan. false berarti tugas ditandai berhenti biasa.
function scheduleReconnect(taskId, code, entry) {
  // Masalah yang tidak akan hilang dengan dicoba ulang: stream key, protokol, atau file
  const cause = friendlyError(entry.recent);
  if (cause && /stream key|rtmps|File video|tidak ditemukan/i.test(cause)) return false;

  const task = loadTask(taskId);
  if (!task || task.status !== 'live') return false;
  if (new Date(task.user_expires_at) <= new Date()) return false;
  if (task.stop_at_utc && new Date(task.stop_at_utc) <= new Date()) return false;

  const ranFor = Date.now() - entry.startedAt;
  const prev = ranFor >= STABLE_MS ? 0 : (retryState.get(taskId)?.attempts || 0);
  const attempts = prev + 1;
  if (attempts > MAX_RECONNECTS) return false;
  retryState.set(taskId, { attempts });

  const delay = RECONNECT_DELAYS[attempts - 1];
  const reason = cause || `FFmpeg berhenti (kode ${code})`;
  db.prepare('UPDATE tasks SET last_error = ?, pid = NULL WHERE id = ?')
    .run(`${reason}. Menyambung ulang (${attempts}/${MAX_RECONNECTS}) dalam ${delay} detik.`, taskId);
  addLog(taskId, `Terputus. Menyambung ulang (${attempts}/${MAX_RECONNECTS}) dalam ${delay} detik`);

  const timer = setTimeout(() => {
    pendingRestart.delete(taskId);
    try {
      const cur = loadTask(taskId);
      if (!cur || cur.status !== 'live' || isRunning(taskId)) return;
      // Jadwal stop bisa sudah lewat selama menunggu. Jangan nyalakan lagi.
      if (cur.stop_at_utc && new Date(cur.stop_at_utc) <= new Date()) {
        db.prepare("UPDATE tasks SET status = 'finished', pid = NULL, ended_at = ?, last_error = NULL WHERE id = ?")
          .run(now(), taskId);
        retryState.delete(taskId);
        addLog(taskId, 'Sambung ulang dibatalkan: jadwal stop sudah tercapai');
        return;
      }
      if (new Date(cur.user_expires_at) <= new Date()) {
        db.prepare("UPDATE tasks SET status = 'stopped', pid = NULL, ended_at = ?, last_error = 'Masa aktif habis' WHERE id = ?")
          .run(now(), taskId);
        retryState.delete(taskId);
        addLog(taskId, 'Sambung ulang dibatalkan: masa aktif habis');
        return;
      }
      launchTask(taskId, { resume: true });
      addLog(taskId, `Tersambung kembali (percobaan ${attempts})`);
    } catch (err) {
      retryState.delete(taskId);
      db.prepare("UPDATE tasks SET status = 'failed', pid = NULL, ended_at = ?, last_error = ? WHERE id = ?")
        .run(now(), `Gagal menyambung ulang: ${err.message}`, taskId);
      addLog(taskId, `Gagal menyambung ulang: ${err.message}`);
    }
  }, delay * 1000);
  pendingRestart.set(taskId, { timer });
  return true;
}

export function stopTask(taskId, reason = 'stopped', errorMessage = null) {
  const pend = pendingRestart.get(taskId);
  if (pend) {
    clearTimeout(pend.timer);
    pendingRestart.delete(taskId);
    retryState.delete(taskId);
    db.prepare('UPDATE tasks SET status = ?, pid = NULL, ended_at = ?, last_error = ? WHERE id = ?')
      .run(reason, now(), errorMessage, taskId);
    addLog(taskId, `Sambung ulang dibatalkan (${reason})`);
    return true;
  }
  const entry = running.get(taskId);
  if (!entry) return false;
  if (!entry.stopReason) {
    entry.stopReason = reason;
    entry.errorMessage = errorMessage;
    entry.child.kill();
  }
  return true;
}

// Dipanggil saat server berhenti: FFmpeg ikut dihentikan supaya tidak jadi proses yatim
export function stopAll(message = 'Server dihentikan') {
  for (const p of pendingRestart.values()) clearTimeout(p.timer);
  pendingRestart.clear();
  for (const [taskId, entry] of running) {
    if (!entry.stopReason) {
      entry.stopReason = 'failed';
      entry.errorMessage = message;
    }
    try { entry.child.kill(); } catch (err) { reportError('stop-all', err); }
  }
}

// Mencari FFmpeg sisa dari run sebelumnya (dikenali dari argumen khas panel). Linux saja, lewat /proc.
// Dipanggil saat boot, sebelum live baru dibuat, jadi tidak mungkin mengenai proses milik panel sendiri.
function killLeftoverFfmpeg() {
  let entries = [];
  try { entries = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)); } catch { return 0; }
  let killed = 0;
  for (const pid of entries) {
    try {
      const args = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0');
      const isPanelFfmpeg = args.some((a) => a.includes('ffmpeg'))
        && args.includes('-progress') && args.includes('pipe:1')
        && args.some((a) => a.startsWith('rtmp'));
      if (isPanelFfmpeg) {
        process.kill(Number(pid), 'SIGTERM');
        killed += 1;
      }
    } catch { /* proses sudah hilang atau tidak bisa dibaca */ }
  }
  return killed;
}

export function recoverOnBoot() {
  const leftover = killLeftoverFfmpeg();
  if (leftover) console.log(`[boot] ${leftover} proses FFmpeg sisa dari run sebelumnya dihentikan`);

  const rows = db.prepare("SELECT id FROM tasks WHERE status = 'live'").all();
  for (const r of rows) {
    db.prepare("UPDATE tasks SET status = 'failed', pid = NULL, ended_at = ?, last_error = 'Server restart saat live' WHERE id = ?")
      .run(now(), r.id);
    addLog(r.id, 'Server restart saat live, tugas ditandai gagal');
  }
}
