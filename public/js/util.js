// Helper umum. Dipakai oleh semua mixin.
const BYTES_GB = 1024 ** 3;

const Util = {
  // ISO UTC -> "YYYY-MM-DDTHH:mm" dalam zona waktu user (untuk datetime-local)
  toLocalInput(iso, tz) {
    if (!iso) return '';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  },

  bytes(b) {
    if (b == null) return '-';
    return b / BYTES_GB >= 1 ? (b / BYTES_GB).toFixed(2) + ' GB' : (b / 1024 ** 2).toFixed(1) + ' MB';
  },

  remain(sec) {
    if (sec == null) return '-';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return d > 0 ? `${d} hari ${h} jam` : `${h} jam ${m} menit`;
  },

  fmt(iso, tz) {
    if (!iso) return '-';
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: tz, day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso));
  },

  statusLabel(s) {
    return ({
      idle: 'Manual', scheduled: 'Terjadwal', live: 'Live',
      finished: 'Selesai', stopped: 'Dihentikan', failed: 'Gagal',
    })[s] || s;
  },
};

// Gabungkan beberapa mixin tanpa menghilangkan getter (Alpine butuh getter tetap reaktif)
function mix(...parts) {
  const out = {};
  for (const p of parts) Object.defineProperties(out, Object.getOwnPropertyDescriptors(p));
  return out;
}

function blankCreate() {
  return { title: '', fileId: '', streamKey: '', startAt: '', stopAt: '', hours: 0, mins: 0, repeat: 'none' };
}

const Theme = {
  get() { return document.documentElement.dataset.theme || 'dark'; },
  set(t) {
    document.documentElement.dataset.theme = t;
    localStorage.setItem('theme', t);
  },
  toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
};

// Gabungkan delta dari server ke daftar yang sudah ada di layar
function applyDelta(list, d) {
  const m = new Map(list.map((x) => [x.id, x]));
  for (const id of d.remove || []) m.delete(id);
  for (const r of d.upsert || []) m.set(r.id, r);
  return d.ids.map((id) => m.get(id)).filter(Boolean);
}
