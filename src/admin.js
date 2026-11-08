// CLI admin. Contoh:
//   npm run admin -- init-admin                      (buat admin acak, hanya jika belum ada admin)
//   npm run admin -- add budi rahasia123 720         (customer, 720 jam)
//   npm run admin -- add-admin owner rahasia123      (akun admin)
//   npm run admin -- extend budi 240
//   npm run admin -- reset budi sandiBaru
//   npm run admin -- list
import crypto from 'node:crypto';
import { db } from './db.js';
import { hashPassword } from './auth.js';
import { PACKAGES } from './config.js';

const [cmd, ...args] = process.argv.slice(2);
const now = new Date();
const FAR_FUTURE = '2999-12-31T23:59:59.000Z';

const usage = () => {
  console.log('Perintah: init-admin | add <user> <pass> <jam> | add-admin <user> <pass> | extend <user> <jam> | reset <user> <pass> | set-package <user> <A|B|C> | list');
  process.exit(1);
};

const findUser = (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username);

function insertUser(username, password, expires, role) {
  db.prepare(`
    INSERT INTO users (username, password_hash, package, storage_limit_bytes, expires_at, must_change_password, created_at, role)
    VALUES (?, ?, 'A', ?, ?, 1, ?, ?)
  `).run(username, hashPassword(password), PACKAGES.A.storageBytes, expires, now.toISOString(), role);
}

switch (cmd) {
  case 'init-admin': {
    if (db.prepare("SELECT id FROM users WHERE role = 'admin'").get()) {
      console.log('Akun admin sudah ada. Dilewati.');
      break;
    }
    const username = `admin-${crypto.randomBytes(3).toString('hex')}`;
    const password = crypto.randomBytes(12).toString('base64url');
    insertUser(username, password, FAR_FUTURE, 'admin');
    console.log('');
    console.log('==========================================================');
    console.log(' AKUN ADMIN DIBUAT');
    console.log(`   Username : ${username}`);
    console.log(`   Password : ${password}`);
    console.log(' Simpan sekarang. Password ini TIDAK akan ditampilkan lagi.');
    console.log(' Wajib diganti saat login pertama.');
    console.log('==========================================================');
    console.log('');
    break;
  }
  case 'add':
  case 'add-admin': {
    const isAdmin = cmd === 'add-admin';
    const [username, password, hours] = args;
    if (!username || !password || (!isAdmin && !hours)) usage();
    if (findUser(username)) throw new Error('Username sudah ada');
    const expires = isAdmin ? FAR_FUTURE : new Date(now.getTime() + Number(hours) * 3600_000).toISOString();
    insertUser(username, password, expires, isAdmin ? 'admin' : 'customer');
    console.log(`${isAdmin ? 'Admin' : 'Customer'} ${username} dibuat, berlaku sampai ${expires}`);
    break;
  }
  case 'extend': {
    const [username, hours] = args;
    if (!username || !hours) usage();
    const user = findUser(username);
    if (!user) throw new Error('User tidak ditemukan');
    const base = Math.max(new Date(user.expires_at).getTime(), now.getTime());
    const expires = new Date(base + Number(hours) * 3600_000).toISOString();
    db.prepare('UPDATE users SET expires_at = ? WHERE id = ?').run(expires, user.id);
    console.log(`Masa aktif ${username} sekarang sampai ${expires}`);
    break;
  }
  case 'reset': {
    const [username, password] = args;
    if (!username || !password) usage();
    const user = findUser(username);
    if (!user) throw new Error('User tidak ditemukan');
    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
      .run(hashPassword(password), user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
    console.log(`Password ${username} direset`);
    break;
  }
  case 'set-package': {
    const [username, pkg] = args;
    if (!username || !PACKAGES[pkg]) usage();
    const user = findUser(username);
    if (!user) throw new Error('User tidak ditemukan');
    db.prepare('UPDATE users SET package = ?, storage_limit_bytes = ? WHERE id = ?')
      .run(pkg, PACKAGES[pkg].storageBytes, user.id);
    console.log(`${username} sekarang ${PACKAGES[pkg].label}`);
    break;
  }
  case 'list': {
    const rows = db.prepare('SELECT username, role, disabled, expires_at FROM users ORDER BY id').all();
    for (const r of rows) {
      const active = r.disabled ? 'NONAKTIF' : (new Date(r.expires_at) > now ? 'AKTIF' : 'HABIS');
      console.log(`${active.padEnd(9)} ${r.role.padEnd(9)} ${r.username.padEnd(20)} s.d. ${r.expires_at}`);
    }
    break;
  }
  default:
    usage();
}
