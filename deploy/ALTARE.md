# Deploy ke Altare (App Hosting)

Panel dijalankan sebagai web app Node.js dari GitHub. HTTPS disediakan Altare,
jadi tidak perlu Caddy. Tidak perlu Docker.

## 1. Buat app
1. Console → **Apps** → **New app** → pilih repository ini.
2. Runtime: **Node.js** (pilih 22 atau 24; panel butuh 22.13+).

## 2. Isi Build and run

| Kolom | Isi |
|---|---|
| Install command | `npm install` |
| Build command | `npm run getffmpeg` |
| Start command | `npm start` |

Penjelasan: `npm run getffmpeg` menyiapkan FFmpeg saat build. Kalau FFmpeg sudah
ada di sistem Altare, unduhan otomatis dilewati. Kalau FFmpeg bawaan sistem tidak
ada pun, binary diunduh ke `storage/bin` (hasilnya bisa dilihat di build log).

## 3. Isi Variables (Deployments → Settings)

| Variable | Isi | Kenapa |
|---|---|---|
| `HOST` | `0.0.0.0` | Wajib. Panel harus bisa diakses dari luar. |
| `ENC_KEY` | 64 karakter hex | Kunci enkripsi stream key. Buat sekali, jangan ganti. |
| `COOKIE_SECURE` | `true` | Karena Altare memberi HTTPS. |
| `TRUST_PROXY` | `1` | Panel di belakang proxy Altare. |
| `FFMPEG_PATH` | (kosong) | Biarkan kosong; panel cari sendiri. |

Cara membuat `ENC_KEY`: di terminal/konsol apa pun jalankan
`openssl rand -hex 32`, lalu salin hasilnya.

## 4. Buat akun admin
App Hosting punya **command job** (Deployments → Processes and cron). Buat job
sekali jalan:

```
npm run admin -- init-admin
```

Catat username dan password yang tampil di log. Password hanya ditampilkan sekali.

## 5. Cek kesiapan
Command job sekali jalan: `npm run doctor`. Semua harus OK, terutama
**FFmpeg** dan **FFmpeg mendukung rtmps://**.

## 6. Alamat
App dapat alamat `nama.go.altare.global`. Domain sendiri bisa lewat **Network**.

## Hal yang perlu dipantau (penting!)
- **Data bertahan atau tidak antar deploy?** Database (`data/app.db`) dan video
  (`storage/`) tersimpan di dalam app. Tes: buat customer, lalu deploy ulang
  (push commit kecil). Kalau datanya hilang, berarti disk App Hosting tidak
  persistent, dan jalur yang benar adalah **Docker Apps** dengan **Data folder**
  (lihat `deploy/DOCKER.md`) plus `DB_PATH`/`STORAGE_DIR` menunjuk ke folder itu.
- **Kuota disk**: Always Free 10 GB. Video memakan ruang banyak; pantau dari
  dashboard admin (Server → disk).
- **Live berjalan lama**: pastikan app tidak direstart otomatis oleh platform.

## Kalau build gagal di langkah getffmpeg
Lihat build log. Kalau pesannya "FFmpeg hasil unduhan tidak bisa dijalankan",
berarti sandbox build Altare membatasi binary. Kabari pemilik/developer, jalur
lanjutannya adalah Docker Apps (image dengan FFmpeg dari apt).
