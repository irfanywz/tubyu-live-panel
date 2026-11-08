# Deploy ke VPS (Ubuntu 22.04 / 24.04)

Asumsi: domain sudah mengarah ke IP VPS (record A), dan kamu login sebagai user dengan sudo.

## 1. Siapkan server
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl unzip ufw
# Node.js 24 LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
# Caddy (HTTPS otomatis)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

## 2. Firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```
Port 3000 jangan dibuka. Panel hanya lewat Caddy.

## 3. User dan aplikasi
```bash
sudo useradd -r -m -d /opt/tubyu-live -s /usr/sbin/nologin tubyu
sudo mkdir -p /opt/tubyu-live
sudo cp -r tubyu-live-panel/. /opt/tubyu-live/
cd /opt/tubyu-live
sudo -u tubyu npm install --omit=dev
sudo -u tubyu cp .env.example .env
sudo -u tubyu npm run gensecret
sudo -u tubyu npm run doctor
```
Di `.env` isi:
```
HOST=127.0.0.1
COOKIE_SECURE=true
TRUST_PROXY=1
```
Lalu `sudo chmod 600 /opt/tubyu-live/.env`.

## 4. Admin dan service
```bash
sudo -u tubyu npm run setup        # catat username dan password admin yang tampil
sudo cp deploy/tubyu-live.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tubyu-live
sudo systemctl status tubyu-live
```

## 5. HTTPS lewat Caddy
Salin `deploy/Caddyfile` ke `/etc/caddy/Caddyfile`, lalu:
```bash
sudo systemctl edit caddy   # tambahkan: [Service] Environment=DOMAIN=live.namadomain.com
sudo systemctl restart caddy
```
Atau tulis domain langsung di Caddyfile, ganti `{$DOMAIN}`.

Buka https://live.namadomain.com/admin.html untuk admin.

## 6. Backup harian
```bash
sudo -u tubyu crontab -e
# tambahkan:
0 3 * * * /opt/tubyu-live/deploy/backup.sh
```
Salin hasil backup ke tempat lain secara berkala (misalnya Google Drive atau bucket).

## 7. Checklist sebelum customer pertama
- [ ] HTTPS aktif, sertifikat valid
- [ ] `npm run doctor` semua hijau di server
- [ ] Live tes berhasil dari server, dengan stream key test
- [ ] Backup berjalan dan bisa dipulihkan (coba sekali)
- [ ] Password admin sudah diganti dari password awal
- [ ] SSH hanya pakai kunci, login root dimatikan
- [ ] Monitor disk: `df -h` (video memakan ruang banyak)
