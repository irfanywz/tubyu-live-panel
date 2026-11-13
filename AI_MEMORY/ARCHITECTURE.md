# ARCHITECTURE

Panel web untuk menjalankan live streaming ke YouTube dari file video yang sudah diunduh.
Satu proses Node.js melayani API, halaman web, dan scheduler. Database berupa SQLite.

## Ringkasan

- **Backend:** Node.js 22.13+ dengan Express. Database `node:sqlite` bawaan Node, tanpa native addon.
- **Frontend:** HTML statis dengan Alpine.js dan Tailwind (CDN). Tidak ada build step.
- **Live:** FFmpeg dijalankan sebagai child process. Binary dari `ffmpeg-static`, atau dari `FFMPEG_PATH`.
- **Realtime:** Server-Sent Events di `/api/stream`. Satu koneksi per tab.
- **Peran:** `customer` dan `admin`. Admin mengelola akun, memantau live, dan mengelola berkas.

## Struktur folder

```
src/
  server.js        Entry point. Semua route HTTP, SSE, dan boot.
  config.js        Konfigurasi dari .env, resolusi FFmpeg, daftar paket.
  db.js            Koneksi SQLite, skema, dan migrasi kolom (ensureColumn).
  auth.js          Hash sandi, sesi cookie, requireAuth, requireAdmin.
  files.js         Antrean download, thumbnail, dan hapus berkas.
  drive.js         Parsing URL Google Drive dan unduhan dengan batas kuota.
  runner.js        Menjalankan dan menghentikan FFmpeg, parsing progres, status real-time.
  logs.js          Log tugas sebagai file per tugas: tulis, baca, pangkas, dan hapus.
  errors.js        Pencatatan error ke server-errors.log tanpa melempar lagi.
  bandwidth.js     Riwayat bandwidth: server per 5 menit dan data dikirim per customer per hari. Ditulis tiap 60 detik.
  monitor.js       Kondisi server (CPU, RAM, disk, jaringan) dan sampel bandwidth. Jaringan dibaca dari /proc, netstat, tanpa PowerShell.
  scheduler.js     Tick tiap 5 detik: mulai, stop, masa aktif habis.
  repeat.js        Membuat occurrence berikutnya untuk tugas berulang.
  checks.js        Pemeriksaan sistem (dipakai doctor, setup, dan admin).
  ffmpeg-errors.js Menerjemahkan log FFmpeg menjadi pesan yang mudah dipahami.
  crypto.js        Enkripsi stream key (AES-256-GCM) dan hint key.
  tz.js            Konversi jam dinding ke UTC per zona waktu.
  ratelimit.js     Batas percobaan login (di memori).
  admin.js         CLI admin: init-admin, add, add-admin, extend, reset, list.
  doctor.js        CLI pemeriksaan sistem.
scripts/
  setup.js         Setup lintas platform: install, ENC_KEY, doctor, akun admin awal.
  gensecret.js     Membuat ENC_KEY di .env tanpa menimpa yang sudah ada.
public/
  index.html       Panel customer.
  admin.html       Panel admin.
  css/theme.css    Warna tema terang dan gelap lewat CSS variable.
  js/util.js       Helper format dan tema.
  js/api.js        Wrapper fetch.
  js/app.js        Komponen Alpine utama, menggabungkan mixin.
  js/mixins/       auth, tasks, files, archive, settings (customer).
  js/admin-app.js  Komponen Alpine untuk panel admin.
deploy/
  DEPLOY.md        Panduan deploy ke VPS.
  Caddyfile        Reverse proxy dan HTTPS.
  tubyu-live.service  Unit systemd.
  backup.sh        Backup SQLite dengan VACUUM INTO.
tests/
  unit.test.js     Tes untuk zona waktu, parsing Drive, dan terjemahan error.
```

## Model data

- **users:** akun. `role` (customer/admin), `expires_at` (masa aktif), `package`, `storage_limit_bytes`, `disabled`, `must_change_password`, `timezone`.
- **sessions:** token sesi cookie. Dihapus saat logout, saat akun dinonaktifkan, atau saat sandi direset.
- **files:** video hasil unduhan. `gdrive_id`, `path`, `thumb_path`, `size_bytes`, `status` (downloading, ready, failed).
- **tasks:** tugas live. `stream_key_enc` (terenkripsi), `key_hint`, `status` (idle, scheduled, live, finished, stopped, failed), jadwal dalam UTC, `duration_sec`, `repeat_rule`, `repeat_spawned`, `pid`.
- **Log tugas:** bukan di database. Ditulis ke `storage/logs/<id>.log` (lihat `logs.js`). Maksimal 512 KB per file, dipangkas ke 300 baris terakhir. File dihapus bersama tugasnya, dan `sweepOrphanLogs()` membersihkan sisa file tiap jam.
- **audit_logs:** aksi admin: extend, reset sandi, disable, stop, hapus berkas, buat customer.

Penambahan kolom dilakukan lewat `ensureColumn` di `db.js`, jadi database lama tetap bisa dipakai tanpa dihapus.

## Alur utama

**Login.** `POST /api/login` memeriksa sandi, akun aktif, dan masa aktif. Gagal lebih dari 5 kali dalam 15 menit mengunci kombinasi IP dan username selama 15 menit. Respons berisi `role`. Admin diarahkan ke `/admin.html`.

**Download video.** `POST /api/files` memvalidasi URL Drive (hanya `drive.google.com`), memeriksa sisa kuota, lalu mengunduh ke `storage/tmp` di latar belakang. Ukuran dicek dari header dan dihitung saat streaming. Setelah selesai, file dipindah ke `storage/videos`, lalu thumbnail dibuat dengan FFmpeg. Kalau gagal, status menjadi `failed` dan pesannya disimpan.

**Buat dan ubah tugas.** `parseTask()` di `server.js` dipakai bersama oleh POST dan PATCH. Jam dari form dianggap jam dinding di zona waktu user, lalu dikonversi ke UTC. Tugas yang sedang live tidak bisa diubah.

**Mulai live.** `launchTask()` di `runner.js` mendekripsi stream key, lalu menjalankan FFmpeg dengan argumen dalam bentuk array (tanpa shell). Argumen penting:
- `-nostdin`: wajib, supaya FFmpeg tidak menunggu stdin.
- `-re -stream_loop -1 -c copy`: membaca file secara real-time dan mengulang tanpa batas.
- `-progress pipe:1 -stats_period 2`: progres dikirim ke stdout dan dibaca untuk status real-time.
- Tujuan: `RTMP_BASE` + stream key. Default `rtmps://a.rtmps.youtube.com:443/live2/`.

**Scheduler.** `tick()` berjalan tiap 5 detik. Urutannya:
1. Masa aktif habis: hentikan live, batalkan yang terjadwal.
2. Waktu stop tercapai: hentikan live dengan status `finished`.
3. Waktu mulai tercapai: jalankan tugas `scheduled`.
4. Buat occurrence berikutnya untuk tugas berulang.

**Akhir live.** Saat FFmpeg berhenti, `exit` menentukan status. Kalau berhenti tanpa diminta, pesan error diterjemahkan dengan `friendlyError()` dari 40 baris stderr terakhir. Log mentah tetap ada di `task_logs`.

**Restart server.** `recoverOnBoot()` mengubah tugas yang masih `live` menjadi `failed`, karena proses FFmpeg-nya ikut mati.

**Realtime.** `/api/stream` mengirim event `state` penuh saat koneksi dibuka. Setelah itu server mengirim event `delta` setiap 2 detik, hanya kalau ada perubahan: tugas yang berubah, tugas yang hilang, atau urutannya. Klien menggabungkannya dengan `applyDelta()`.

**Ketahanan.** Sambung ulang otomatis: jika FFmpeg putus tanpa diminta, runner menjadwalkan percobaan dengan jeda bertahap (`RECONNECT_DELAYS`), maksimal 5 kali. Tidak dicoba untuk stream key salah, protokol, atau file bermasalah. Error event FFmpeg dan error penulisan log dicatat, tidak membunuh proses. Error yang lolos ditangani global: FFmpeg dihentikan, lalu proses keluar dan systemd menyalakannya lagi. Watchdog menghentikan live yang tidak mengirim progres lebih dari 60 detik.

## Keamanan

- Sandi di-hash dengan bcrypt, cost 12.
- Sesi memakai cookie `httpOnly` dan `SameSite=Lax`. `Secure` aktif kalau `COOKIE_SECURE=true`.
- Stream key dienkripsi AES-256-GCM dengan `ENC_KEY`. Key hanya didekripsi saat diminta lewat `/api/tasks/:id/key`.
- Hilangnya `ENC_KEY` berarti semua stream key tersimpan tidak bisa dibaca lagi. Jangan ubah setelah ada tugas.
- Semua query memakai parameter, tidak ada string SQL dari input.
- FFmpeg dijalankan dengan `spawn` dan array argumen, jadi input user tidak bisa menyisipkan argumen.
- Route admin dilindungi `requireAdmin`. Admin tidak bisa mengubah akun admin lain lewat panel.
- Akun yang dinonaktifkan dicabut sesinya dan live-nya dihentikan.
- Rate limit login ada di memori. Reset saat server restart. Untuk produksi, pasang di belakang reverse proxy dan isi `TRUST_PROXY`.

## Konfigurasi

Lihat `.env.example`. Variabel utama:

| Variabel | Fungsi |
|---|---|
| `ENC_KEY` | Kunci enkripsi stream key, 64 karakter hex. Dibuat oleh `npm run gensecret`. |
| `HOST`, `PORT` | Alamat dan port listen. Default `127.0.0.1:3000`. |
| `FFMPEG_PATH` | Opsional. Kalau kosong, dipakai `ffmpeg-static`, lalu `ffmpeg` di PATH. |
| `RTMP_BASE` | Tujuan ingest. Default RTMPS YouTube. |
| `COOKIE_SECURE` | `true` kalau sudah pakai HTTPS. |
| `TRUST_PROXY` | `1` kalau di belakang reverse proxy. |
| `DB_PATH`, `STORAGE_DIR` | Opsional. Default di `data/` dan `storage/`. |

## Paket dan batas tugas

Paket didefinisikan di `PACKAGES` (`src/config.js`). Setiap paket punya:
- `storageBytes`: kuota penyimpanan video.
- `maxActive`: jumlah tugas yang boleh berstatus idle, scheduled, atau live sekaligus. Tugas finished, stopped, dan failed tidak dihitung.
- `maxLive`: jumlah tugas yang boleh berjalan bersamaan.

| Paket | Tugas aktif | Live bersamaan | Storage |
|---|---|---|---|
| A | 3 | 3 | 3 GB |
| B | 5 | 5 | 5 GB |
| C | 10 | 10 | 10 GB |

`src/limits.js` berisi `checkQuota()`, yang dipanggil di empat tempat:
- Buat tugas (`POST /api/tasks`) dan edit tugas (`PATCH`): cek tugas aktif.
- Start tugas arsip (`/start`): membuat salinan baru, jadi cek tugas aktif dan live.
- `launchTask()` di `runner.js`: cek live. Ini juga berlaku untuk tugas terjadwal, jadi scheduler tidak bisa melewati batas.
- `spawnRepeats()` di `repeat.js`: kalau kuota penuh, occurrence berikutnya dilewati dan dicatat di log tugas.

Admin mengganti paket lewat panel atau `npm run admin -- set-package <user> <A|B|C>`. Batas baru berlaku untuk tugas berikutnya. Tugas yang sudah ada tidak dihapus, walaupun melebihi batas paket baru.

## Batasan yang diketahui

- Unduhan Google Drive memakai endpoint publik yang bisa berubah. Tes berkala diperlukan.
- Tidak ada transcode. Resolusi dan bitrate mengikuti file sumber (`-c copy`).
- Satu proses dan satu database. Belum ada dukungan multi-server.
- Rate limit dan status live ada di memori.
- Tidak ada pembayaran. Perpanjangan masa aktif dan perubahan paket dilakukan admin.
- Tidak ada notifikasi keluar (Telegram, email).
- Batas tugas dan live diuji dengan skrip sementara, belum ada tes otomatis di `tests/`.

## Menjalankan dan menguji

```
npm install
npm run setup     # kunci, pemeriksaan, akun admin awal
npm start
npm test          # tes unit
npm run doctor    # cek kesiapan sistem kapan saja
```


---


## Proses (ringkasan dependensi)
Satu proses Node: `src/server.js` menjalankan Express (API + static `public/`), SSE, scheduler, monitor, dan flush bandwidth. Boot: `recoverOnBoot()` → `startMonitor()` → `startBandwidthFlush()` → `startScheduler()`.

## Alur dependensi (dari bawah ke atas)
- `config.js` (env, resolusi FFmpeg, PACKAGES) → dipakai hampir semua.
- `db.js` (skema, migrasi `ensureColumn`, drop tabel lama) → semua modul data.
- `crypto.js` (AES-256-GCM, `keyFingerprint` HMAC), `tz.js`, `errors.js`, `ratelimit.js`.
- `auth.js` (sesi, requireAuth/requireAdmin) → `server.js`.
- `drive.js` (URL + unduhan) → `files.js` (antrean unduhan, thumbnail, batal, hapus).
- `limits.js` (`checkQuota`, `usageFor`) → dipakai `server.js`, `runner.js`, `repeat.js`.
- `logs.js` (log per file) → `runner.js`, `scheduler.js`, `repeat.js`, `server.js`.
- `ffmpeg-errors.js` (terjemahan error) → `runner.js`.
- `runner.js` (spawn FFmpeg, progres, timer, sambung ulang, stop) → `scheduler.js`, `server.js`.
- `repeat.js` (occurrence berulang) → `scheduler.js`.
- `scheduler.js` (tick 5 detik: expiry, stop, start, watchdog, repeat).
- `monitor.js` (CPU/RAM/disk/jaringan, sampel 5 menit) → `bandwidth.js`.
- `bandwidth.js` (riwayat 5 menit dan per customer per hari, flush 60 detik).
- `checks.js` (pemeriksaan sistem) → `doctor.js`, `server.js` (/api/system), `scripts/setup.js`.
- `admin.js` (CLI admin), `scripts/gensecret.js`, `scripts/setup.js`.

## Frontend
- `public/index.html` + `js/app.js` (gabung mixin: `auth`, `tasks`, `files`, `archive`, `settings`) — panel customer.
- `public/admin.html` + `js/admin-app.js` (+ `js/about.js`) — panel admin.
- `public/js/util.js` (format, `Theme`, `applyDelta`), `public/js/api.js` (fetch wrapper).
- Alpine memanggil `init()` otomatis; JANGAN pakai `x-init="init()"` lagi (menyebabkan init dobel).

## Realtime
- Customer: `/api/stream` (SSE). Event `state` penuh saat konek, lalu `delta` (upsert/remove/ids) tiap 2 detik bila berubah.
- Admin: tidak memakai SSE. Dashboard di-refresh manual atau auto refresh (10 detik, jaringan tetap dibaca).

## Penyimpanan
- `data/app.db` (SQLite WAL), `storage/videos`, `storage/thumbs`, `storage/tmp`, `storage/logs/<id>.log`, `storage/logs/server-errors.log`.
