// Membuat ENC_KEY di .env. Aman dijalankan ulang: kalau ENC_KEY sudah ada, tidak diubah.
// Mengubah ENC_KEY membuat semua stream key yang tersimpan tidak bisa dibaca lagi.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  fs.copyFileSync(examplePath, envPath);
  console.log('.env dibuat dari .env.example');
}

let text = fs.readFileSync(envPath, 'utf8');
const existing = text.match(/^ENC_KEY=(.*)$/m);

if (existing && existing[1].trim()) {
  console.log('ENC_KEY sudah ada di .env, tidak diubah.');
  process.exit(0);
}

const key = crypto.randomBytes(32).toString('hex');
text = existing
  ? text.replace(/^ENC_KEY=.*$/m, `ENC_KEY=${key}`)
  : `${text.trimEnd()}\nENC_KEY=${key}\n`;

fs.writeFileSync(envPath, text);
console.log('ENC_KEY berhasil dibuat dan disimpan di .env');
console.log('Jangan hapus atau ubah ENC_KEY setelah ada tugas yang dibuat.');
