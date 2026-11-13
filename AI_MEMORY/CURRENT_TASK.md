# CURRENT_TASK

Terakhir diperbarui: saat versi 0.17.0 (menu Tentang).

## Status
Panel fungsional lengkap untuk model rental (customer + admin). Belum diuji end-to-end di VPS produksi oleh AI. Pemilik sedang menguji langsung di Google Cloud Shell dan VPS.

## Selesai (diperiksa sintaks saja, belum dijalankan AI)
- Semua fitur di PROJECT.md "Fitur yang sudah ada", termasuk 0.14.0 (progres & batal unduhan), 0.15.0 (satu key satu tugas aktif), 0.16.0 (timer saat tersambung, log per customer), 0.17.0 (menu Tentang).
- Yang diverifikasi dengan eksekusi nyata (sandbox AI, DB sementara): aturan kuota tugas aktif/live bersamaan; konversi zona waktu WIB/WITA.
- `node --test` untuk unit test: 6 lulus (dijalankan sebelum aturan "AI tidak menjalankan tes" berlaku).

## Terverifikasi oleh pemilik (dilaporkan)
- `npm install` di Windows, dan `npm install-scripts approve ffmpeg-static` lalu `npm rebuild` berhasil.
- Live dari CLI berjalan. Live dari panel awalnya macet karena proses FFmpeg sisa memakai key yang sama (sudah ditangani di 0.14.3).
- Binary `ffmpeg-static` **segfault** saat membuka RTMPS di Cloud Shell (Linux). Solusi yang dipakai: FFmpeg sistem via `FFMPEG_PATH=/usr/bin/ffmpeg`.

## Belum diverifikasi (perlu dites pemilik)
- Tampilan semua halaman di browser (terutama mode terang, nav HP, sub-tab dashboard).
- Auto refresh tetap aktif setelah refresh (diperbaiki 0.12.3, dilaporkan masih bermasalah sebelum itu).
- Tombol Tempel (clipboard butuh HTTPS atau localhost).
- Progres dan batal unduhan.
- Timer mulai saat tersambung; label "Menghubungkan...".
- Penolakan key ganda; peringatan non-systemd.
- Menu Tentang (versi, tombol donasi/website).
- Sambung ulang vs auto-stop: dugaan pemilik (FFmpeg respawn 3x) belum bisa direproduksi dari kode. Celah yang sudah ditutup: reconnect setelah jadwal stop lewat (0.13.0). Jika terjadi lagi, butuh log tugas dengan timestamp.

## Bug / risiko aktif
- Live di Cloud Shell mati karena sesi terminal (SIGHUP) dan binary ffmpeg-static tidak stabil. Rekomendasi: VPS + systemd + FFmpeg sistem.
- Auto refresh admin di Windows: jaringan tidak lagi memakai PowerShell (0.11.0), tapi belum dikonfirmasi pemilik di Windows.
- `kode null` pada log lama berarti proses dibunuh sinyal; sejak 0.14.2 pesan menyebut sinyalnya.
- Rate limit hanya untuk login (endpoint lain belum dibatasi).
- Stream key tampil di kode/log percakapan pemilik saat debugging: pemilik sebaiknya rotasi key di YouTube Studio bila sudah pernah dibagikan.

## Langkah berikutnya (urutan usulan)
1. Pemilik menguji checklist "Belum diverifikasi" di atas dan melaporkan hasilnya.
2. Jika belum ada keluhan: deploy ke VPS (`deploy/DEPLOY.md`), pakai FFmpeg sistem, service systemd.
3. Opsional, sesuai keputusan pemilik: notifikasi Telegram (live gagal, disk > 85%, masa aktif habis); backup database ke cloud; rate limit endpoint unduhan/buat tugas; Content-Security-Policy di Caddy.
4. Setiap perubahan: naikkan versi, update AI_MEMORY/CHANGELOG.md dan about.js.
