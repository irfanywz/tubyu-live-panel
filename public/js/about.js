// Data untuk menu Tentang di panel admin.
// Versi tidak diisi di sini. Diambil otomatis dari package.json lewat /api/about.
const ABOUT_INFO = {
  name: 'Tubyu Live Panel',
  description: 'Panel untuk menjalankan live streaming ke YouTube dari file video yang sudah diunduh. Dikelola dari satu dashboard, dengan masa aktif per customer, pemantauan server, dan pengaturan paket.',
  developer: 'irfanywz',
  website: 'https://irfanywz.web.id/',
  donate: 'https://irfanywz.web.id/about/#support',
};

// Riwayat perubahan dari sisi fitur, dari versi pertama sampai terbaru.
const CHANGELOG_LOG = [
  { version: '0.1.0', items: [
    'Login dengan masa aktif per akun.',
    'Unduh video dari Google Drive.',
    'Buat tugas live dengan jadwal mulai, jadwal stop, dan auto-stop.',
    'Dashboard, arsip live, dan ganti sandi.',
  ] },
  { version: '0.2.0', items: [
    'Pemasangan lebih mudah lewat satu perintah setup.',
    'Pemeriksaan sistem untuk mengecek kesiapan server.',
    'Log live dan status real-time.',
  ] },
  { version: '0.3.0', items: [
    'Panel admin: kelola customer, berkas, dan audit log.',
    'Pengulangan jadwal harian dan mingguan.',
    'Edit tugas yang belum live.',
    'Thumbnail dan preview video.',
    'Tampilan terang dan gelap, serta tampilan yang nyaman di HP.',
    'Stream key bisa dilihat dan disalin, lalu dipakai ulang dari arsip.',
  ] },
  { version: '0.4.0', items: [
    'Paket A, B, dan C dengan batas tugas aktif dan live bersamaan.',
    'Admin bisa mengganti paket customer.',
  ] },
  { version: '0.4.1', items: [
    'Preset jam masa aktif saat menambah customer.',
    'Kartu info akun siap kirim, dengan tombol salin.',
    'Reset dan salin sandi customer.',
  ] },
  { version: '0.5.0', items: [
    'Log tugas lebih ringan dan tidak membebani database.',
  ] },
  { version: '0.6.0', items: [
    'Pemantauan live yang macet, dengan pesan yang jelas.',
    'Penjelasan cara mengambil stream key di form.',
  ] },
  { version: '0.7.0', items: [
    'Sambung ulang otomatis saat koneksi ke YouTube putus.',
    'Panduan menyiapkan video agar live stabil.',
    'Penjelasan penyebab live berhenti.',
  ] },
  { version: '0.7.1', items: [
    'Panduan konversi video untuk 720p, 1080p, dan 4K, dengan cara cek hasilnya.',
  ] },
  { version: '0.8.0', items: [
    'Pemantauan server di admin: CPU, RAM, disk, dan upload live.',
  ] },
  { version: '0.9.0', items: [
    'Riwayat bandwidth server dan data yang dikirim per customer.',
  ] },
  { version: '0.10.0', items: [
    'Dashboard admin dalam satu halaman, dengan tombol Refresh.',
    'Grafik bandwidth harian.',
  ] },
  { version: '0.10.1', items: [
    'Auto refresh di dashboard admin, bisa dinyalakan atau dimatikan.',
  ] },
  { version: '0.11.0', items: [
    'Kecepatan upload dan download server.',
    'Dashboard admin dibagi menjadi Server, Live, Bandwidth, dan Sistem.',
  ] },
  { version: '0.12.0', items: [
    'Spesifikasi server di dashboard admin.',
  ] },
  { version: '0.13.0', items: [
    'Tombol Tempel untuk stream key dan link Google Drive.',
    'Live tidak lagi dinyalakan ulang setelah jadwal stop lewat.',
  ] },
  { version: '0.14.0', items: [
    'Progres unduhan video dan tombol Batal.',
  ] },
  { version: '0.15.0', items: [
    'Satu stream key hanya bisa dipakai satu tugas aktif.',
  ] },
  { version: '0.16.0', items: [
    'Timer auto-stop mulai saat live benar-benar tersambung ke YouTube.',
    'Admin bisa melihat tugas dan log per customer.',
  ] },
];
