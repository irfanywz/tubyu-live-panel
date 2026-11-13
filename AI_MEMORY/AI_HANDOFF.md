# AI_HANDOFF (baca ini dulu)

## Proyek
**Tubyu Live Panel** (v0.17.0): panel web untuk live streaming YouTube dari file video, model rental dengan masa aktif dan paket A/B/C. Node.js 22.13+, Express, `node:sqlite`, Alpine.js + Tailwind CDN, FFmpeg (`ffmpeg-static` opsional atau `FFMPEG_PATH`).

## Status
Fungsional lengkap untuk customer dan admin. Sebagian besar sudah dilaporkan pemilik berjalan di Windows (install, setup, CLI live). Panel live di Cloud Shell bermasalah karena binary ffmpeg-static (segfault) dan proses sisa; sudah ditangani dengan FFmpeg sistem dan pembersihan proses sisa. Banyak perubahan UI belum dikonfirmasi pemilik (lihat CURRENT_TASK.md).

## Yang tidak boleh dilanggar
- AI **tidak** menjalankan tes atau pengecekan di sistem. Pemilik yang menguji. (`node --check` sintaks dibolehkan.)
- Tidak ada pembayaran, kuota bandwidth, transcode di server, tombol WhatsApp, LICENSE.
- ENC_KEY tidak boleh diganti setelah ada data.
- Jangan pakai `x-init="init()"` di Alpine (init dobel).
- Jaringan jangan dibaca lewat PowerShell (monitor.js: /proc, netstat).
- Log live menampilkan perintah dengan stream key disamarkan.
- Jangan simpan rahasia di dokumentasi atau kode.

## File penting untuk pekerjaan berikutnya
- Live/FFmpeg: `src/runner.js`, `src/scheduler.js`, `src/ffmpeg-errors.js`, `src/config.js` (resolveFfmpeg).
- Kuota & key: `src/limits.js`, `src/server.js` (`parseTask`), `src/crypto.js`.
- Unduhan: `src/files.js`, `src/drive.js`, `public/js/mixins/files.js`.
- Admin: `public/admin.html`, `public/js/admin-app.js`, `public/js/about.js`.
- Customer: `public/index.html`, `public/js/mixins/*.js`, `public/js/app.js`.
- Setup/deploy: `scripts/setup.js`, `deploy/DEPLOY.md`.

## Keputusan penting
Lihat `DECISIONS.md`. Yang paling sering menyangkut pekerjaan baru: kuota = tugas aktif + live bersamaan; monitoring tanpa PowerShell; manual refresh di admin; log per file.

## Langkah berikutnya
Lihat `CURRENT_TASK.md`. Ringkasnya: tunggu hasil tes pemilik, lalu deploy VPS (systemd + FFmpeg sistem). Fitur opsional (Telegram, backup cloud, rate limit) hanya jika pemilik minta.

## Belum diverifikasi
Semua tampilan di browser; auto refresh di Windows; Tempel; progres unduhan; timer tersambung; menu Tentang; deploy VPS produksi; dugaan respawn 3x (belum bisa direproduksi).
