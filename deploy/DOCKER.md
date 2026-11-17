# Jalankan panel dengan Docker

Cocok untuk: PaaS yang mendukung Docker (Railway, Fly.io, Render, Koyeb), dan VPS
yang lebih suka Docker daripada systemd.

Kenapa Docker di sini aman: FFmpeg dipasang dari repositori Debian **di dalam
image**, jadi FFmpeg-nya pasti cocok dengan sistem di dalam container, apa pun
sistem operasi host-nya. Tidak perlu `FFMPEG_PATH`, tidak perlu unduhan manual.

## 1. Siapkan `.env`
```bash
cp .env.example .env
# Kosongkan atau hapus FFMPEG_PATH (di dalam container pakai FFmpeg dari apt).
# Untuk server dengan HTTPS, isi juga:
#   COOKIE_SECURE=true
#   TRUST_PROXY=1
```

Buat `ENC_KEY` (sekali saja, jangan diganti setelah ada data):
```bash
echo "ENC_KEY=$(openssl rand -hex 32)" >> .env
```

## 2. Jalankan
```bash
docker compose up -d --build
```

## 3. Buat akun admin (hanya pertama kali)
```bash
docker compose run --rm panel npm run admin -- init-admin
```
Catat username dan password yang tampil. Password hanya ditampilkan sekali.

## 4. Cek kesiapan (opsional tapi disarankan)
```bash
docker compose run --rm panel npm run doctor
```

## 5. Perintah harian
| Perintah | Fungsi |
|---|---|
| `docker compose logs -f panel` | Lihat log panel |
| `docker compose restart panel` | Mulai ulang panel |
| `docker compose down` | Matikan panel (data tetap aman di `data/` dan `storage/`) |
| `docker compose up -d --build` | Jalankan ulang setelah ada pembaruan kode |

## HTTPS
- **PaaS** (Railway, Fly.io, Render, dst): HTTPS sudah disediakan platform.
  Cukup set `COOKIE_SECURE=true` dan `TRUST_PROXY=1` di `.env`.
- **VPS dengan Caddy di host**: pakai `deploy/Caddyfile` seperti di `DEPLOY.md`.
  Panel sudah hanya di `127.0.0.1:3000`, jadi sama persis dengan cara systemd.
  Checklist `TRUST_PROXY=1` dan `COOKIE_SECURE=true` di `.env`.

## Catatan penting
- Data (`data/app.db`) dan berkas video (`storage/`) disimpan di folder host lewat
  volume, jadi tidak hilang saat container di-rebuild.
- Backup tetap pakai `deploy/backup.sh` dari host.
- Live berjalan di dalam container. Pastikan disk cukup; video memakan ruang banyak.
- Jangan isi `FFMPEG_PATH` di `.env` kecuali memang tahu alasannya.
