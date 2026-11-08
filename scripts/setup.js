// npm run setup: install dependency, buat ENC_KEY, pemeriksaan sistem, dan akun admin acak.
// Berjalan sama di Windows, Linux, dan macOS.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [maj, min] = process.versions.node.split('.').map(Number);
const run = (file, args, opts = {}) =>
  spawnSync(process.execPath, [path.join(root, file), ...args], { cwd: root, stdio: 'inherit', ...opts });

console.log('== StreamFlow setup ==\n');

if (!(maj > 22 || (maj === 22 && min >= 13))) {
  console.error(`Node.js ${process.version} terlalu lama. Butuh 22.13 atau lebih baru.`);
  process.exit(1);
}

if (!fs.existsSync(path.join(root, 'node_modules', 'express'))) {
  console.log('[1/4] Install dependency (npm install)...');
  const r = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error('\nnpm install gagal. Cek koneksi internet atau proxy, hapus folder node_modules, lalu ulangi.');
    process.exit(1);
  }
} else {
  console.log('[1/4] Dependency sudah terpasang, dilewati.');
}

console.log('\n[2/4] Membuat ENC_KEY...');
run('scripts/gensecret.js', []);

console.log('\n[3/4] Pemeriksaan sistem...\n');
const doctor = run('src/doctor.js', []);

console.log('\n[4/4] Akun admin...');
run('src/admin.js', ['init-admin']);

console.log('');
if (doctor.status === 0) {
  console.log('Setup selesai. Langkah berikutnya: npm start, lalu buka http://127.0.0.1:3000/admin.html');
} else {
  console.log('Setup belum lengkap. Perbaiki item yang bertanda GAGAL, lalu jalankan: npm run doctor');
  process.exit(1);
}
