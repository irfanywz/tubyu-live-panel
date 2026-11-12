// Pakai node:sqlite bawaan Node (>= 22.13), jadi tidak perlu compile native addon.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  package TEXT NOT NULL DEFAULT 'A',
  storage_limit_bytes INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gdrive_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  filename TEXT,
  path TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id),
  stream_key_enc TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  scheduled_start_utc TEXT,
  stop_at_utc TEXT,
  duration_sec INTEGER,
  status TEXT NOT NULL,
  pid INTEGER,
  started_at TEXT,
  ended_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
`);

// Migrasi ringan: tambah kolom baru tanpa menghapus data lama
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
ensureColumn('users', 'timezone', "TEXT NOT NULL DEFAULT 'Asia/Jakarta'");
ensureColumn('tasks', 'repeat_rule', "TEXT NOT NULL DEFAULT 'none'");
ensureColumn('tasks', 'repeat_spawned', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('files', 'thumb_path', 'TEXT');
ensureColumn('users', 'role', "TEXT NOT NULL DEFAULT 'customer'");
ensureColumn('users', 'disabled', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  admin_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT
);
`);

// Log sekarang disimpan sebagai file (lihat logs.js). Tabel lama dibuang dan file dipadatkan.
const legacyLogs = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_logs'").get();
if (legacyLogs) {
  db.exec('DROP TABLE task_logs');
  db.exec('VACUUM');
}

// Riwayat bandwidth untuk analisa. Tidak dihapus otomatis.
db.exec(`
CREATE TABLE IF NOT EXISTS bandwidth_5m (
  bucket TEXT PRIMARY KEY,               -- awal interval 5 menit, UTC ISO
  up_bytes INTEGER NOT NULL DEFAULT 0,   -- total upload server pada interval itu
  down_bytes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS usage_customer_daily (
  day TEXT NOT NULL,                     -- YYYY-MM-DD, UTC
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_bytes INTEGER NOT NULL DEFAULT 0, -- data yang dikirim FFmpeg ke YouTube
  PRIMARY KEY (day, user_id)
);
`);
ensureColumn('files', 'progress_bytes', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('files', 'total_bytes', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('tasks', 'key_hash', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_key_hash ON tasks(key_hash)');
