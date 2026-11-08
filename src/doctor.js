// npm run doctor: cek kesiapan sistem dan tampilkan saran untuk yang gagal.
import { runChecks } from './checks.js';

const items = runChecks(true);
for (const i of items) {
  console.log(`${i.ok ? '[OK]  ' : '[GAGAL]'} ${i.label}${i.detail ? ` — ${i.detail}` : ''}`);
  if (!i.ok && i.hint) console.log(`        Saran: ${i.hint}`);
}

const failed = items.filter((i) => !i.ok);
console.log('');
if (failed.length) {
  console.log(`${failed.length} pemeriksaan gagal. Perbaiki dulu sebelum menjalankan panel.`);
  process.exit(1);
}
console.log('Semua pemeriksaan lolos. Jalankan panel dengan: npm start');
