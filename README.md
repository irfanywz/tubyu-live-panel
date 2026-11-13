# Tubyu Live Panel

Panel web untuk menjalankan live streaming ke YouTube dari file video yang sudah diunduh.
Dibuat dengan Node.js, Express, SQLite, dan FFmpeg. Berjalan di Windows, Linux, dan macOS.

Dokumentasi teknis dan riwayat perubahan ada di folder `AI_MEMORY/` (`ARCHITECTURE.md`, `CHANGELOG.md`).

## Persyaratan

- Node.js 22.13 atau lebih baru (disarankan 24 LTS)
- Koneksi internet, untuk unduhan video dan CDN (Tailwind, Alpine, Iconify)

FFmpeg tidak perlu dipasang manual. Paket `ffmpeg-static` ikut terpasang saat `npm install`.
Kalau mau memakai FFmpeg sendiri, isi `FFMPEG_PATH` di `.env`.

## Instalasi

```
npm install
npm run setup
npm start
```

- `npm run setup` membuat `ENC_KEY`, menjalankan pemeriksaan sistem, dan membuat akun admin acak.
  Catat username dan password admin yang tampil. Password hanya ditampilkan sekali.
- Buka http://127.0.0.1:3000 untuk panel customer, dan http://127.0.0.1:3000/admin.html untuk admin.

Setelah login pertama, admin disarankan mengganti sandi di menu Akun & sandi.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Menjalankan panel |
| `npm run setup` | Instalasi awal lintas platform |
| `npm run doctor` | Cek kesiapan sistem |
| `npm run gensecret` | Membuat `ENC_KEY` jika belum ada |
| `npm run admin -- init-admin` | Membuat admin acak, hanya jika belum ada admin |
| `npm run admin -- add <user> <pass> <jam>` | Membuat customer dengan masa aktif |
| `npm run admin -- add-admin <user> <pass>` | Membuat akun admin |
| `npm run admin -- extend <user> <jam>` | Menambah masa aktif |
| `npm run admin -- reset <user> <pass>` | Mereset sandi |
| `npm run admin -- list` | Melihat semua akun |
| `npm test` | Menjalankan tes unit |

## Konfigurasi

Salin `.env.example` menjadi `.env` (dilakukan otomatis oleh `npm run setup`).

Jangan ubah `ENC_KEY` setelah ada tugas yang dibuat. Stream key yang sudah tersimpan tidak bisa dibaca lagi.

## Deploy

Lihat `deploy/DEPLOY.md` untuk panduan VPS: Caddy untuk HTTPS, service systemd, dan backup harian.

## Catatan keamanan

Panel ini belum diaudit oleh pihak ketiga. Sebelum dipakai untuk customer sungguhan:

- **Jalankan di belakang HTTPS.** Pakai Caddy atau reverse proxy lain. Set `COOKIE_SECURE=true` dan `TRUST_PROXY=1`.
- **Jaga `ENC_KEY`.** Kunci ini melindungi semua stream key di database. Hilangnya kunci berarti key tidak bisa dibaca lagi. Simpan cadangannya di tempat terpisah.
- **Jaga `.env`.** Batasi aksesnya (misalnya `chmod 600`). Jangan commit ke repo.
- **Ganti sandi awal admin.** Password dari `npm run setup` hanya ditampilkan sekali.
- **Rate limit login ada di memori.** Reset saat server restart. Untuk produksi, tambahkan pembatasan di reverse proxy.
- **Stream key bisa dilihat oleh pemilik akun dan admin.** Panel ini memang dirancang begitu, supaya key bisa dipakai ulang. Jangan bagikan akun ke pihak lain.
- **Unduhan Google Drive memakai endpoint publik** yang bisa berubah. Pastikan video yang diunduh punya hak untuk di-live-kan.
- **Backup database** secara berkala. Lihat `deploy/backup.sh`, dan cek bahwa backup bisa dipulihkan.
- **Update dependency** secara berkala dengan `npm audit`.

## Lisensi

Belum ditentukan.
