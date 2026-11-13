# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/).

## [0.17.0]

### Ditambahkan
- Menu Tentang di panel admin: informasi aplikasi, pengembang, versi, tombol donasi dan website, serta riwayat perubahan.

## [0.16.0]

### Ditambahkan
- Admin bisa melihat tugas per customer dan log lengkap setiap tugas, termasuk perintah FFmpeg yang dijalankan (stream key disamarkan).

### Diubah
- Timer auto-stop dimulai saat FFmpeg benar-benar tersambung dan mengirim data, bukan saat proses dibuat. Selama menghubungkan, label menunjukkan "Menghubungkan...".

## [0.15.0]

### Ditambahkan
- Satu stream key hanya boleh dipakai satu tugas aktif (manual, terjadwal, atau live). Pengecekan dilakukan saat buat, ubah, dan mulai ulang tugas. Dibandingkan lewat sidik jari HMAC, tanpa menyimpan key dalam bentuk teks.
- Live tidak bisa dimulai kalau key yang sama sedang live di tugas lain.
- Peringatan di log saat panel tidak dijalankan sebagai service systemd.

## [0.14.3]

### Diperbaiki
- Saat panel dijalankan, FFmpeg sisa dari run sebelumnya (yang masih memakai stream key) dihentikan dulu. Ini mencegah stream macet atau loading karena dua proses memakai key yang sama. Hanya berlaku di Linux.

## [0.14.2]

### Diubah
- Log tugas mencatat perintah FFmpeg yang dijalankan (stream key disamarkan) dan PID-nya.
- Saat FFmpeg berhenti tanpa kode keluar, pesannya menyebut sinyal yang menghentikan prosesnya, bukan "kode null".
- Log berhenti mencatat kode keluar dan sinyal.

## [0.14.1]

### Diperbaiki
- Pesan di terminal saat server dan setup berjalan memakai nama Tubyu Live Panel.

## [0.14.0]

### Ditambahkan
- Progres unduhan video: byte yang sudah diterima dan persentase, diperbarui tiap detik.
- Tombol Batal untuk unduhan yang sedang berjalan. Berkas yang dibatalkan tidak tercatat sebagai gagal.

### Diperbaiki
- Kolom link Google Drive kembali memanjang penuh. Tombol Tempel sekarang berada di dalam input, di sisi kanan.

## [0.13.1]

### Diubah
- `npm run setup` mengecek binary FFmpeg bawaan. Kalau belum ada, setup mengizinkan skrip `ffmpeg-static` lalu menjalankan `npm rebuild ffmpeg-static`. Kalau tetap gagal, setup memberi petunjuk memakai `FFMPEG_PATH`.

## [0.13.0]

### Diperbaiki
- Sambung ulang tidak lagi menyalakan FFmpeg kalau jadwal stop sudah tercapai atau masa aktif sudah habis selama menunggu. Kalau FFmpeg berhenti setelah jadwal stop lewat, tugas ditandai selesai, bukan gagal.
- Tombol Tempel di kolom stream key dan link Google Drive.
- `ffmpeg-static` menjadi optional dependency. Kalau binary-nya tidak terpasang (misalnya karena npm memblokir skrip install), panel memakai FFmpeg dari `FFMPEG_PATH` dan pemeriksaan memberi petunjuk.

## [0.12.3]

### Diperbaiki
- Status auto refresh tidak lagi kembali ke mati setelah halaman di-refresh. Penyebabnya, `init()` dijalankan dua kali karena Alpine sudah memanggilnya otomatis dan `x-init` juga memanggilnya. Panel customer juga terkena hal yang sama, sehingga timer dan pengambilan data sempat dobel.
- Toggle sekarang mengatur status secara eksplisit, bukan membalik status.

## [0.12.2]

### Diperbaiki
- Status toggle auto refresh tidak lagi kembali mati karena browser memakai file JavaScript lama. File panel sekarang selalu diperiksa ulang oleh browser.

## [0.12.1]

### Diubah
- Kartu Spesifikasi server pindah ke sub-tab Sistem.
- Kartu Perlu perhatian pindah ke atas tab Customer, supaya bisa langsung ditindaklanjuti dengan tombol perpanjang.

## [0.12.0]

### Ditambahkan
- Kartu Spesifikasi server di sub-tab Server: hostname, sistem operasi, CPU, RAM total, disk video total, versi Node.js, dan versi FFmpeg.

## [0.11.1]

### Diperbaiki
- Status toggle auto refresh di dashboard admin diingat di browser. Setelah refresh, status terakhir dipertahankan. Default tetap mati.

## [0.11.0]

### Diubah
- Jaringan dibaca tanpa PowerShell: `/proc/net/dev` di Linux, `netstat -e` di Windows, dan `netstat -ib` di macOS.
- Dependency `systeminformation` dihapus.
- Auto refresh memperbarui jaringan juga, karena pembacaannya sekarang ringan.
- Jaringan ditampilkan sebagai kecepatan (kbps atau Mbps) dan total, bukan persen. Keterangan link NIC dihapus.
- Dashboard admin memakai sub-tab: Server, Live, Bandwidth, dan Sistem. Ringkasan utama tetap terlihat di atas.

## [0.10.1]

### Ditambahkan
- Toggle auto refresh di Dashboard admin, default mati. Saat aktif, data diperbarui tiap 10 detik.
- Auto refresh tidak membaca jaringan ulang, supaya PowerShell di Windows tidak berjalan tiap 10 detik. Nilai jaringan diperbarui saat Refresh manual atau tiap 5 menit.

## [0.10.0]

### Diubah
- Panel admin disederhanakan menjadi satu halaman Dashboard. Kondisi server, monitor live, bandwidth, dan kesiapan sistem ada di satu tempat.
- Semua pemantauan diperbarui lewat tombol Refresh. Tidak ada lagi pembaruan real-time di panel admin.
- Pengambilan kondisi jaringan hanya saat Refresh dan sekali tiap 5 menit untuk riwayat. Sebelumnya dilakukan tiap 5 detik, dan di Windows membuat PowerShell berjalan terus-menerus.
- Navigasi mobile admin: Dashboard, Customer, Berkas, dan Lainnya.

### Dihapus
- Ekspor CSV bandwidth.

## [0.9.0]

### Ditambahkan
- Riwayat bandwidth server per interval 5 menit, disimpan di database untuk analisa.
- Riwayat data yang dikirim FFmpeg ke YouTube per customer per hari. Tidak hilang saat tugas dihapus.
- Tab Bandwidth di admin: ringkasan bulan ini, grafik harian, dan tabel per customer.
- Ekspor CSV untuk analisa: bandwidth server per hari dan pemakaian customer per hari.

## [0.8.1]

### Ditambahkan
- Monitoring jaringan di Ringkasan admin: persentase upload dan download dibanding kecepatan link NIC utama, kecepatan saat ini, dan total sejak server nyala.
- Dependency baru: `systeminformation`, untuk membaca jaringan di Windows, Linux, dan macOS.

## [0.8.0]

### Ditambahkan
- Monitoring server real-time di Ringkasan admin: CPU, RAM, disk tempat video, upload live saat ini, uptime, memori panel, dan beban (Linux dan macOS).
- Data dikirim lewat SSE khusus admin, diambil tiap 5 detik. Hanya memakai modul bawaan Node, tanpa dependency baru.

## [0.7.1]

### Diubah
- Panduan menyiapkan video kini memiliki tiga profil (720p, 1080p, dan 4K) dengan perintah FFmpeg masing-masing.
- Perintah tidak memakai `scale` atau `pad`, supaya tampilan video tetap sama dengan aslinya.
- Ditambahkan cara mengecek resolusi sumber dan hasil convert dengan ffprobe.

## [0.7.0]

### Ditambahkan
- Sambung ulang otomatis saat FFmpeg putus tanpa diminta. Maksimal 5 percobaan dengan jeda 5, 15, 30, 60, lalu 120 detik. Hitungan direset setelah jalan stabil 10 menit.
- Sambung ulang tidak dicoba untuk stream key salah, protokol tidak didukung, atau file bermasalah.
- Watchdog tidak menghentikan tugas yang sedang menunggu sambung ulang.
- Penyebab putus yang lebih spesifik di pesan error: timestamp tidak beraturan, data menumpuk, dan video rusak.
- Panduan menyiapkan video (perintah konversi H.264 dengan bitrate stabil) di Berkas Video.
- Penjelasan penyebab live berhenti sendiri di panduan Buat Tugas Live.

### Diubah
- Tidak ada konversi video di server. Video disiapkan user sebelum diunggah.

## [0.6.0]

### Ditambahkan
- Penangkap error global. Error yang lolos dicatat ke `storage/logs/server-errors.log`.
- Saat server berhenti (SIGTERM, SIGINT, atau error), FFmpeg yang sedang berjalan ikut dihentikan.
- Watchdog: live tanpa progres lebih dari 60 detik dihentikan dan ditandai gagal dengan pesan jelas.
- Penjelasan cara mengambil stream key di form buat tugas.

### Diubah
- Error saat menulis log tidak lagi menghentikan live. Disk penuh hanya tercatat sekali per menit.
- Event handler FFmpeg dibungkus, sehingga error database tidak membunuh proses.
- Stream realtime mengirim perubahan saja (delta), bukan daftar penuh setiap 2 detik.
- Peta percobaan login dibersihkan berkala.

## [0.5.0]

### Diubah
- Log tugas dipindah dari database ke file per tugas di `storage/logs/`. Database tidak lagi membengkak karena log.
- Log dipangkas otomatis ke 300 baris terakhir saat melewati 512 KB.
- File log dihapus bersama tugasnya, dan file yatim dibersihkan tiap jam.
- Tabel `task_logs` dihapus saat pertama kali jalan. Log lama ikut hilang.

## [0.4.2]

### Diubah
- Log tugas dibatasi 300 baris terakhir per tugas, dipangkas setiap 50 penulisan.
- Baris log yang sama persis dengan baris sebelumnya tidak ditulis ulang.

## [0.4.1]

### Ditambahkan
- Form tambah customer menampilkan total jam dan jumlah hari, dengan tombol cepat 1, 7, dan 30 hari.
- Kartu info akun setelah customer dibuat, berisi username, sandi, paket, dan masa aktif, dengan tombol salin per baris dan salin pesan siap kirim.
- Tombol reset sandi di daftar customer membuat sandi baru dan menampilkannya untuk disalin.
- Indikator loading saat membuat customer.

### Diubah
- Nama folder dan paket menjadi `tubyu-live-panel`.

## [0.4.0]

### Ditambahkan
- Paket A, B, dan C dengan batas tugas aktif, batas live bersamaan, dan kuota storage.
- Aturan tugas aktif: tugas selesai, dihentikan, atau gagal tidak dihitung, jadi slot kembali sendiri.
- Pengecekan batas live di satu tempat (`launchTask`), jadi berlaku untuk start manual maupun jadwal.
- Admin bisa mengganti paket customer dari panel, dan memilih paket saat membuat customer.
- Perintah CLI `set-package`.
- Dashboard customer menampilkan paket, tugas aktif, dan live bersamaan.
- Catatan keamanan di README.

### Diubah
- Pengulangan yang melampaui batas paket dilewati dan dicatat di log, tidak membuat tugas baru.
- `PACKAGES` berisi label dan batas. Paket A tetap 3 GB seperti sebelumnya.

## [0.3.0]

### Ditambahkan
- Panel admin di `/admin.html`: ringkasan, customer, monitor live, berkas, sistem, audit log, dan akun.
- Admin bisa menambah customer, memperpanjang masa aktif, mereset sandi, menonaktifkan akun, dan menghentikan live.
- Admin bisa melihat dan menghapus berkas semua customer, dengan preview.
- Audit log untuk aksi admin.
- Peran `customer` dan `admin`, serta perintah `add-admin` dan `init-admin` di CLI.
- `npm run setup` membuat akun admin acak dan menampilkan kredensialnya sekali.
- Pengulangan jadwal harian dan mingguan.
- Edit tugas. Tugas yang sedang live tidak bisa diubah.
- Status live real-time: bitrate, kecepatan, dan progres auto-stop.
- Streaming realtime lewat SSE, menggantikan polling.
- Thumbnail video dan preview dengan dukungan seek.
- Tema terang dan gelap.
- Panel responsif: sidebar di desktop, header dan nav bawah di HP.
- Stream key bisa dilihat dan disalin, serta dipakai ulang dari arsip.
- Rate limit login.
- Zona waktu per user.
- Deploy: panduan VPS, Caddyfile, unit systemd, backup SQLite.
- Tes unit dengan `node:test`.
- Logo dan favicon.

### Diubah
- Nama panel customer menjadi Tubyu Live Panel. Sapaan username tampil di header.
- Kartu tugas di dashboard dan berkas, menggantikan tabel.
- Pesan error FFmpeg diterjemahkan ke bahasa yang mudah dipahami.
- RTMPS jadi default.

## [0.2.0]

### Ditambahkan
- `npm run setup` lintas platform, menggantikan rencana file `.bat`.
- `npm run doctor` dan halaman Sistem untuk memeriksa FFmpeg, dukungan RTMPS, database, dan folder storage.
- FFmpeg bawaan dari `ffmpeg-static`, dengan urutan prioritas `FFMPEG_PATH`, lalu `ffmpeg-static`, lalu PATH.
- Log live dan status real-time.

### Diubah
- `better-sqlite3` diganti `node:sqlite` bawaan Node, supaya tidak perlu compile di Windows.
- Argumen FFmpeg menambahkan `-nostdin`, yang memperbaiki live macet di beberapa kondisi.

## [0.1.0]

### Ditambahkan
- Login dengan masa aktif per user, dan sesi cookie.
- Unduh video dari Google Drive dengan kuota storage per paket.
- Buat tugas live dengan jadwal mulai, jadwal stop, dan auto-stop berdasarkan durasi.
- Scheduler dan runner FFmpeg.
- Dashboard, arsip, dan pengaturan sandi.
- Enkripsi stream key dengan AES-256-GCM.

## [Belum dirilis]

### Direncanakan
- Notifikasi ke admin (Telegram).
- Monitor live dan notifikasi untuk customer, jika diperlukan.
