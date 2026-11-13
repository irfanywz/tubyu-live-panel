# PROJECT

## Tujuan
Tubyu Live Panel: panel web untuk menjalankan live streaming ke YouTube dari file video yang sudah diunduh (Google Drive). Dipakai sebagai layanan rental live: admin membuat customer dengan masa aktif dan paket, customer membuat tugas live.

- Nama produk: **Tubyu Live Panel** (panel customer dan admin). Nama lama "StreamFlow" / "Rental Live Streaming" sudah tidak dipakai.
- Pengembang: irfanywz. Versi aktif ada di `package.json` (saat dokumen ini dibuat: 0.17.0).
- Repo akan dipublikasikan oleh pemilik. Belum ada lisensi (keputusan pemilik: tidak perlu LICENSE).

## Teknologi
- Node.js 22.13+ (disarankan 24 LTS).
- Backend: Express 4, bcryptjs, dotenv. Database: `node:sqlite` bawaan Node (bukan better-sqlite3, karena compile native gagal di Windows).
- FFmpeg: `ffmpeg-static` (optionalDependency) atau `FFMPEG_PATH` di `.env`.
- Frontend: HTML statis + Alpine.js 3.14.1 + Tailwind (CDN), tanpa build step. Icon: Iconify (CDN).
- Tidak ada dependency monitoring eksternal (systeminformation sudah dihapus).

## Fitur yang sudah ada
- Login, sesi cookie, rate limit login (memori), ganti sandi, zona waktu per user.
- Masa aktif per customer (login ditolak saat habis; live dihentikan).
- Paket A/B/C: kuota storage, maksimal tugas aktif, maksimal live bersamaan.
- Unduh video dari Google Drive (progres, batal, thumbnail, preview).
- Tugas live: jadwal mulai/stop, auto-stop durasi, pengulangan harian/mingguan, edit (kecuali saat live), preset form.
- Live: FFmpeg `-c copy -stream_loop -1` ke RTMPS YouTube; status real-time; watchdog; sambung ulang otomatis; timer auto-stop mulai saat tersambung.
- Satu stream key hanya untuk satu tugas aktif (sidik jari HMAC).
- Log tugas per file di `storage/logs/`.
- Admin: dashboard (Server, Live, Bandwidth, Sistem), customer (tambah, perpanjang, paket, reset sandi, nonaktif, tugas & log), berkas, audit log, akun, Tentang. Auto refresh (default mati, status diingat).
- Pemantauan server: CPU, RAM, disk video, jaringan (/proc, netstat), upload live, riwayat bandwidth.
- Tema terang/gelap, UI responsif (sidebar desktop, nav bawah HP).

## Yang TIDAK dibuat (keputusan pemilik)
- Pembayaran, penagihan, perpanjangan mandiri (perpanjangan dilakukan admin).
- Kuota bandwidth dan persentase terhadap kuota provider.
- Transcode/konversi video di server, dan `scale`/`pad` di panduan (resolusi harus sama dengan sumber).
- Tombol WhatsApp.
- Notifikasi keluar (Telegram/email): masih opsional, belum dikerjakan.

## Aturan pengembangan (wajib)
- **AI tidak menjalankan tes atau pengecekan di sistem.** Pemilik menguji langsung. Boleh membuat/memeriksa sintaks file dengan `node --check` sebagai pengecekan ringan, lalu serahkan ke pemilik untuk diuji.
- Jangan mengarang status: tulis yang sudah diverifikasi dan yang belum (lihat CURRENT_TASK.md).
- Setiap perubahan fitur: naikkan versi di `package.json`, tambahkan entri di `AI_MEMORY/CHANGELOG.md` (teknis) dan `public/js/about.js` (riwayat untuk pengguna, bahasa fitur).
- Panduan/ UI ditulis dalam Bahasa Indonesia yang sederhana.
- Jangan simpan stream key, password, ENC_KEY, atau token di dokumentasi maupun kode.
- ENC_KEY tidak boleh diganti setelah ada data (stream key tidak bisa didekripsi lagi).
