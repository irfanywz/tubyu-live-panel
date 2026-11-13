# AI_INSTRUCTIONS (wajib diikuti)

## Membaca
1. Baca `AI_HANDOFF.md` terlebih dahulu.
2. Baca `CURRENT_TASK.md` dan `CODE_MAP.md` bila relevan.
3. Cocokkan informasi penting dengan source code pada file yang diperlukan (`grep` nama fungsi, bukan membaca semua file).
4. Jangan membaca seluruh proyek dari awal hanya untuk memahami.
5. Jangan mengulang pekerjaan yang sudah tercatat selesai.
6. Lanjutkan dari langkah berikutnya yang tercatat, kecuali pemeriksaan menunjukkan langkah itu sudah tidak relevan.
7. Jika informasi penting tidak ada, lakukan pemeriksaan terarah atau tanyakan ke pemilik.

## Mengerjakan
- **Jangan menjalankan tes atau pengecekan di sistem.** Pemilik menguji langsung. Boleh `node --check` untuk sintaks.
- Verifikasi dengan membaca kode, bukan mengarang. Tulis di dokumentasi hanya yang sudah diverifikasi; sisanya ditandai "belum diverifikasi".
- Pertahankan keputusan di `DECISIONS.md`. Jika harus berubah, catat alasannya.
- UI dan panduan: Bahasa Indonesia sederhana, tidak teknis untuk customer.
- Perubahan fitur: naikkan versi di `package.json`; tambahkan entri di `AI_MEMORY/CHANGELOG.md` (teknis) dan `public/js/about.js` (fitur, untuk pengguna).

## Memelihara memori
- Setelah perubahan signifikan: perbarui `CODE_MAP.md` (jika ada file/fungsi baru), `ARCHITECTURE.md` (jika alur berubah), `DECISIONS.md` (jika ada keputusan baru), `AI_MEMORY/CHANGELOG.md`.
- Sebelum sesi berakhir atau pemilik pindah chat: perbarui `AI_HANDOFF.md` dan `CURRENT_TASK.md`.
- Jangan menyalin source code ke dokumentasi. Jangan menduplikasi isi dokumen lain; tunjuk saja.
- Jangan menyimpan password, ENC_KEY, token, atau stream key.
- Jika dokumentasi berbeda dengan kode, periksa kode, lalu koreksi dokumentasi.

## Keselamatan
- Stream key selalu disamarkan di log dan UI (`hint`).
- Route admin wajib `requireAdmin`; route customer wajib `requireAuth` dan cek kepemilikan (`user_id`).
- Input file/URL dari user divalidasi (URL Drive: host `drive.google.com` saja; FFmpeg dengan argumen array).
