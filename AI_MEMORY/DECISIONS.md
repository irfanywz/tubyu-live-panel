# DECISIONS

Setiap keputusan: apa, mengapa. Jangan dibalik tanpa diskusi dengan pemilik.

1. **node:sqlite, bukan better-sqlite3.** better-sqlite3 gagal compile di Windows (tidak ada prebuilt untuk Node 24). node:sqlite bawaan Node 22.13+.
2. **Satu proses, satu database.** Belum multi-server. Multi-server bisa nanti dengan mode worker.
3. **Stream key dienkripsi AES-256-GCM dengan ENC_KEY, dan dicek duplikasi lewat HMAC.** Key bisa dilihat pemilik akun dan admin (dipakai ulang). ENC_KEY tidak boleh diganti.
4. **Satu stream key hanya untuk satu tugas aktif** (idle/scheduled/live), dan live ditolak jika key yang sama sedang live. Alasan: YouTube hanya satu sesi per key; dua pengirim membuat stream macet.
5. **Kuota paket dihitung per tugas aktif dan per live bersamaan**, bukan total riwayat. Tugas selesai/stop/gagal tidak memakan slot. Alasan: user tidak perlu menghapus arsip hanya agar bisa membuat tugas baru.
6. **Tidak ada transcode di server.** `-c copy`. Video disiapkan user dengan FFmpeg di komputernya (panduan 720p/1080p/4K, tanpa scale/pad agar tampilan sama dengan asli). Alasan: beban CPU VPS.
7. **Timer auto-stop mulai saat FFmpeg mengirim progres pertama**, bukan saat proses dibuat.
8. **Sambung ulang otomatis**: 5, 15, 30, 60, 120 detik; maksimal 5 percobaan; reset setelah jalan stabil 10 menit; tidak untuk error key/protokol/file; dibatalkan saat jadwal stop lewat, masa aktif habis, atau user menekan Stop.
9. **Watchdog**: live tanpa progres > 60 detik (atau > 90 detik tanpa progres sama sekali) dihentikan dan ditandai gagal.
10. **Log per tugas dalam file** `storage/logs/<id>.log` (maks 512 KB, dipangkas ke 300 baris), bukan database. Alasan: database tidak membengkak. Log lama (tabel task_logs) dibuang saat migrasi.
11. **Error FFmpeg diterjemahkan** (ffmpeg-errors.js) dan sinyal kematian proses dicatat. Error tak dikenal tetap menyebut kode/sinyal.
12. **Monitoring tanpa PowerShell**: `/proc/net/dev` (Linux), `netstat -e` (Windows), `netstat -ib` (macOS). Alasan: `systeminformation` memanggil PowerShell tiap pembacaan jaringan di Windows, membuat CPU tinggi. Dependency ini dihapus.
13. **Jaringan ditampilkan sebagai kecepatan (kbps/Mbps), bukan persen.** Persen butuh kapasitas link, yang tidak tersedia dari netstat. Keterangan link NIC dihapus atas permintaan pemilik.
14. **Tidak ada kuota bandwidth.** Hanya monitoring dan riwayat. Ekspor CSV dihapus atas permintaan pemilik.
15. **Dashboard admin manual refresh**; auto refresh default mati, dan statusnya disimpan di localStorage (`adminAutoRefresh`). Admin tidak memakai SSE.
16. **SSE untuk customer hanya kirim delta** (upsert/remove/ids), bukan daftar penuh.
17. **Frontend tanpa build step** (Alpine + Tailwind CDN). Jangan pakai `x-init="init()"` karena Alpine sudah memanggil `init()` otomatis (menyebabkan init dobel).
18. **Panel customer tidak memaksa ganti sandi**, hanya pengingat. Admin awal tetap wajib ganti (must_change_password dicatat, tidak dipaksa di UI customer).
19. **Admin dibuat lewat CLI** (`init-admin`, `add-admin`), tidak ada cara dari web.
20. **Pembayaran, penagihan, perpanjangan mandiri: tidak dibuat.** Perpanjangan dan ganti paket dilakukan admin.
21. **Tombol WhatsApp tidak ada.** Customer sudah tahu kontak penyedia jasa.
22. **ffmpeg-static dijadikan optionalDependency.** Di Linux tertentu binary-nya segfault dan di Windows npm bisa memblokir skrip install. `setup` mencoba `npm rebuild ffmpeg-static`; jika tetap gagal, `FFMPEG_PATH` dipakai.
23. **Deploy: VPS + Caddy (HTTPS) + systemd.** Proses FFmpeg dihentikan saat service berhenti (`KillMode=control-group`). Peringatan dicatat jika panel tidak berjalan sebagai service.
24. **Tidak ada lisensi.** Keputusan pemilik, repo miliknya.
25. **Tidak ada tes otomatis oleh AI.** Pemilik menguji sendiri (keputusan pemilik).
26. **Nama produk: Tubyu Live Panel.** Menggantikan StreamFlow dan "Rental Live Streaming".
27. **Log admin per customer dan log per tugas** dapat dilihat admin lewat modal "Tugas & log". Stream key di log selalu disamarkan (`****`).
