// Menerjemahkan log FFmpeg yang teknis menjadi pesan yang bisa dipahami operator.
// Log mentah tetap disimpan di task_logs.
const RULES = [
  { re: /Non-monotonous DTS|non-monotonically increasing dts|Timestamps are unset|invalid dropping/i,
    msg: 'Timestamp di file video tidak beraturan, biasanya saat video diulang. Konversi video ke format live (H.264 CBR), lalu unggah ulang.' },
  { re: /Too many packets buffered|buffer.*full/i,
    msg: 'Data video menumpuk karena upload lambat. Cek kecepatan upload internet, atau bitrate video terlalu besar.' },
  { re: /Invalid NAL|non-existing PPS|decode_slice|error while decoding/i,
    msg: 'Video sumber rusak atau tidak standar. Konversi ulang video dengan pengaturan live, lalu unggah ulang.' },
  { re: /Output file #0 does not contain any stream|Stream map .* matches no streams/i,
    msg: 'Video tidak punya stream yang bisa dipakai. Cek file video.' },
  { re: /-10053|Connection aborted|Software caused connection abort/i,
    msg: 'Koneksi ke YouTube diputus oleh sistem (-10053). Cek antivirus, firewall, atau VPN di komputer/server, lalu coba lagi.' },
  { re: /-10054|Connection reset|reset by peer/i,
    msg: 'YouTube menutup koneksi. Biasanya stream key sedang dipakai live lain, atau stream di YouTube Studio belum siap menerima data.' },
  { re: /Protocol not found|Unknown protocol|protocol.*rtmps/i,
    msg: 'FFmpeg ini tidak mendukung rtmps://. Jalankan npm run setup atau pakai build FFmpeg yang lengkap.' },
  { re: /timed out|Operation timed out|Connection timed out/i,
    msg: 'Koneksi ke YouTube timeout. Cek kestabilan internet, firewall, atau VPN.' },
  { re: /Connection refused/i,
    msg: 'YouTube menolak koneksi. Cek internet dan pastikan port 443 tidak diblokir.' },
  { re: /Failed to resolve|Name or service not known|getaddrinfo|Temporary failure in name resolution/i,
    msg: 'Nama server YouTube tidak bisa di-resolve. Cek DNS atau koneksi internet.' },
  { re: /\b(401|403)\b|Unauthorized|Forbidden|Invalid stream/i,
    msg: 'YouTube menolak stream key. Cek lagi stream key di YouTube Studio.' },
  { re: /No such file or directory/i,
    msg: 'File video tidak ditemukan di server. Coba unduh ulang file ini.' },
  { re: /Invalid data found|moov atom not found/i,
    msg: 'File video rusak atau tidak bisa dibaca. Coba upload ulang file yang berbeda.' },
];

export function friendlyError(lines) {
  const text = lines.join('\n');
  for (const r of RULES) if (r.re.test(text)) return r.msg;
  return null;
}
