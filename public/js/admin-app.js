// Panel admin. Semua pemantauan ada di Dashboard dan diperbarui lewat tombol Refresh.
const ADMIN_TABS = ['dashboard', 'customer', 'berkas', 'audit', 'akun'];
const TAB_ALIAS = { ringkasan: 'dashboard', live: 'dashboard', bandwidth: 'dashboard', sistem: 'dashboard' };

const PKG_INFO = {
  A: { label: 'Paket A', maxActive: 3, maxLive: 3, storage: '3 GB' },
  B: { label: 'Paket B', maxActive: 5, maxLive: 5, storage: '5 GB' },
  C: { label: 'Paket C', maxActive: 10, maxLive: 10, storage: '10 GB' },
};

function genPassword(len = 14) {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function adminApp() {
  return {
    me: null,
    tab: 'dashboard',
    theme: 'dark',
    refreshing: false,
    updatedAt: null,
    autoRefresh: false,   // default mati, user yang menyalakan
    dashTab: 'server',
    autoTimer: null,
    AUTO_MS: 10000,

    // data dashboard
    summary: { live: 0, scheduled: 0, errorsToday: 0, customers: 0, expiringSoon: 0 },
    customers: [],
    live: [],
    monitor: null,
    bw: null,
    bwDays: 30,
    system: [],

    // data tab lain
    files: [],
    audit: [],
    preview: null,

    // customer
    newC: { username: '', password: '', hours: 720, package: 'A' },
    creating: false,
    created: null,
    copiedKey: '',

    // akun
    pw: { old: '', n1: '', n2: '' },
    pwMsg: '',
    pwOk: false,

    msg: '',
    msgOk: true,
    moreOpen: false,

    async init() {
      try {
        this.me = await api('/api/me');
        if (this.me.role !== 'admin') { location.href = '/'; return; }
      } catch {
        location.href = '/';
        return;
      }
      this.theme = Theme.get();
      const initial = location.hash.slice(1);
      this.tab = this.resolveTab(initial);
      window.addEventListener('hashchange', () => this.go(location.hash.slice(1)));
      await this.refreshAll();
    },

    resolveTab(t) {
      t = TAB_ALIAS[t] || t;
      return ADMIN_TABS.includes(t) ? t : 'dashboard';
    },

    go(t) {
      this.tab = this.resolveTab(t);
      this.moreOpen = false;
      if (location.hash !== '#' + this.tab) history.replaceState(null, '', '#' + this.tab);
      this.loadTab();
    },

    // Refresh manual dan auto refresh memperbarui data yang sama. Jaringan kini dibaca tanpa PowerShell, jadi aman diulang.
    toggleAuto() {
      this.autoRefresh = !this.autoRefresh;
      clearInterval(this.autoTimer);
      this.autoTimer = null;
      if (this.autoRefresh) {
        this.autoTimer = setInterval(() => {
          if (!document.hidden && !this.refreshing) this.refreshAll();
        }, this.AUTO_MS);
        this.refreshAll();
      }
    },

    async refreshAll() {
      this.refreshing = true;
      try {
        const [summary, customers, live, monitor, bw, system] = await Promise.all([
          api('/api/admin/summary'),
          api('/api/admin/customers'),
          api('/api/admin/live'),
          api('/api/admin/monitor'),
          api(`/api/admin/bandwidth?days=${this.bwDays}`),
          api('/api/system'),
        ]);
        this.summary = summary;
        this.customers = customers;
        this.live = live;
        this.monitor = monitor;
        this.bw = bw;
        this.system = system;
        this.updatedAt = new Date();
        await this.loadTab();
      } catch (e) {
        this.say(e.message, false);
      } finally {
        this.refreshing = false;
      }
    },

    async loadTab() {
      try {
        if (this.tab === 'berkas') this.files = await api('/api/admin/files');
        if (this.tab === 'audit') this.audit = await api('/api/admin/audit');
      } catch (e) { /* dicoba lagi saat Refresh */ }
    },

    setBwDays(d) {
      this.bwDays = d;
      this.refreshAll();
    },

    say(text, ok = true) {
      this.msg = text;
      this.msgOk = ok;
      setTimeout(() => { if (this.msg === text) this.msg = ''; }, 4000);
    },

    toggleTheme() {
      Theme.toggle();
      this.theme = Theme.get();
    },

    // ----- customer -----
    setHours(h) { this.newC.hours = h; },

    get hoursHint() {
      const h = Number(this.newC.hours) || 0;
      if (h <= 0) return 'Isi jumlah jam masa aktif';
      const d = Math.floor(h / 24);
      const r = h % 24;
      const parts = [];
      if (d) parts.push(`${d} hari`);
      if (r) parts.push(`${r} jam`);
      return `= ${parts.join(' ')} (total ${h} jam)`;
    },

    async createCustomer() {
      this.creating = true;
      try {
        const body = { ...this.newC, hours: Number(this.newC.hours) };
        const res = await api('/api/admin/customers', { method: 'POST', body });
        this.created = {
          mode: 'baru',
          username: body.username,
          password: body.password,
          package: body.package,
          expires_at: res.expires_at || new Date(Date.now() + body.hours * 3_600_000).toISOString(),
        };
        this.newC = { username: '', password: '', hours: 720, package: 'A' };
        await this.refreshAll();
      } catch (e) {
        this.say(e.message, false);
      } finally {
        this.creating = false;
      }
    },

    // Sandi lama tidak bisa dibaca lagi (hanya hash yang disimpan), jadi dibuat sandi baru
    async resetPw(c) {
      if (!confirm(`Buat sandi baru untuk ${c.username}? Sandi lama tidak bisa dipakai lagi.`)) return;
      const pw = genPassword();
      try {
        await api(`/api/admin/customers/${c.id}/reset-password`, { method: 'POST', body: { password: pw } });
        this.created = { mode: 'reset', username: c.username, password: pw, package: c.package, expires_at: c.expires_at };
        await this.refreshAll();
      } catch (e) { this.say(e.message, false); }
    },

    accountMessage(c) {
      if (!c) return '';
      const info = PKG_INFO[c.package] || PKG_INFO.A;
      const intro = c.mode === 'reset'
        ? 'Sandi akun Tubyu Live Panel kamu sudah direset.'
        : 'Akun Tubyu Live Panel kamu sudah aktif.';
      return [
        intro,
        '',
        `Link panel : ${location.origin}/`,
        `Username   : ${c.username}`,
        `Password   : ${c.password}`,
        `Paket      : ${info.label} (maks ${info.maxActive} tugas aktif, ${info.maxLive} live bersamaan, storage ${info.storage})`,
        `Masa aktif : sampai ${Util.fmt(c.expires_at, 'Asia/Jakarta')} WIB`,
        '',
        'Segera ganti password setelah login pertama.',
      ].join('\n');
    },

    async copyText(text, key) {
      try {
        await navigator.clipboard.writeText(text);
        this.copiedKey = key;
        setTimeout(() => { if (this.copiedKey === key) this.copiedKey = ''; }, 1500);
      } catch (e) {
        alert('Gagal menyalin. Salin manual dari kotak di layar.');
      }
    },

    get createdInfo() {
      if (!this.created) return null;
      return PKG_INFO[this.created.package]?.label || this.created.package;
    },

    async act(c, action, body) {
      try {
        const res = await api(`/api/admin/customers/${c.id}/${action}`, { method: 'POST', body });
        this.say(this.doneText(action, c, res));
        await this.refreshAll();
      } catch (e) { this.say(e.message, false); }
    },

    doneText(action, c, res) {
      return ({
        extend: `Masa aktif ${c.username} diperpanjang`,
        'reset-password': `Sandi ${c.username} direset`,
        toggle: res.disabled ? `${c.username} dinonaktifkan` : `${c.username} diaktifkan`,
        'stop-all': `${res.stopped} live ${c.username} dihentikan`,
      })[action] || 'Berhasil';
    },

    extend(c, hours) { if (confirm(`Tambah ${hours} jam untuk ${c.username}?`)) this.act(c, 'extend', { hours }); },
    stopAll(c) { if (confirm(`Hentikan semua live milik ${c.username}?`)) this.act(c, 'stop-all'); },
    toggle(c) {
      const verb = c.disabled ? 'mengaktifkan' : 'menonaktifkan (live akan dihentikan)';
      if (confirm(`Yakin ${verb} ${c.username}?`)) this.act(c, 'toggle');
    },

    async setPackage(c, pkg) {
      if (c.package === pkg) return;
      if (!confirm(`Ganti paket ${c.username} ke Paket ${pkg}? Batas baru berlaku untuk tugas berikutnya.`)) return;
      try {
        await api(`/api/admin/customers/${c.id}/package`, { method: 'POST', body: { package: pkg } });
        this.say(`Paket ${c.username} diganti ke ${pkg}`);
        await this.refreshAll();
      } catch (e) { this.say(e.message, false); }
    },

    // ----- live -----
    async stopLive(t) {
      if (!confirm(`Hentikan live "${t.title}" milik ${t.owner}?`)) return;
      try {
        await api(`/api/admin/tasks/${t.id}/stop`, { method: 'POST' });
        this.say('Live dihentikan');
        await this.refreshAll();
      } catch (e) { this.say(e.message, false); }
    },

    liveText(t) {
      const st = t.stats;
      if (!st) return 'Menunggu data FFmpeg...';
      if (st.age_sec > 15) return `⚠ Tidak ada data sejak ${st.age_sec} detik`;
      const parts = [];
      if (st.bitrate) parts.push(st.bitrate);
      if (st.speed) parts.push(st.speed);
      if (st.total_size) parts.push(Util.bytes(st.total_size) + ' terkirim');
      return parts.join(' · ') || 'Live';
    },

    // ----- berkas -----
    async deleteFile(f) {
      if (!confirm(`Hapus file "${f.filename || f.id}" milik ${f.owner}?`)) return;
      try {
        await api(`/api/admin/files/${f.id}`, { method: 'DELETE' });
        this.say('File dihapus');
        await this.loadTab();
      } catch (e) { this.say(e.message, false); }
    },

    openPreview(f) { this.preview = f; },
    closePreview() { this.preview = null; },
    streamUrl(f) { return `/api/admin/files/${f.id}/stream`; },
    thumbUrl(f) { return `/api/admin/files/${f.id}/thumb`; },

    // ----- akun -----
    async changePw() {
      this.pwMsg = '';
      if (this.pw.n1 !== this.pw.n2) {
        this.pwOk = false;
        this.pwMsg = 'Konfirmasi sandi tidak sama';
        return;
      }
      try {
        await api('/api/password', { method: 'POST', body: { oldPassword: this.pw.old, newPassword: this.pw.n1 } });
        this.pw = { old: '', n1: '', n2: '' };
        this.pwOk = true;
        this.pwMsg = 'Sandi berhasil diubah.';
        this.me.must_change_password = false;
      } catch (e) {
        this.pwOk = false;
        this.pwMsg = e.message;
      }
    },

    // ----- turunan untuk tampilan -----
    get customersOnly() { return this.customers.filter((c) => c.role === 'customer'); },
    get systemOk() { return this.system.length > 0 && this.system.every((c) => c.ok); },
    get expiringList() { return this.customersOnly.filter((c) => c.remaining_sec < 3 * 86400 && !c.disabled); },
    get bwMax() {
      if (!this.bw) return 1;
      return Math.max(1, ...this.bw.daily.map((d) => Math.max(d.up, d.down)));
    },
    get bwMonthLabel() {
      return new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    },
    get netUp() { return this.rateText(this.monitor?.network?.upKbps); },
    get netDown() { return this.rateText(this.monitor?.network?.downKbps); },

    get autoText() {
      return this.autoRefresh ? `Otomatis tiap ${this.AUTO_MS / 1000} detik` : 'Auto refresh mati';
    },

    get updatedText() {
      return this.updatedAt ? this.updatedAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
    },

    barPct(v) { return Math.max(1, Math.round((v / this.bwMax) * 100)); },

    uptimeText() {
      if (!this.monitor) return '-';
      const s = this.monitor.uptimeSec;
      const d = Math.floor(s / 86400);
      const h = Math.floor((s % 86400) / 3600);
      const m = Math.floor((s % 3600) / 60);
      return d ? `${d} hari ${h} jam` : `${h} jam ${m} menit`;
    },

    // Kecepatan jaringan dalam kbps, atau Mbps kalau sudah besar
    rateText(kbps) {
      if (kbps === null || kbps === undefined) return 'menghitung...';
      return kbps >= 1000 ? (kbps / 1000).toFixed(1) + ' Mbps' : kbps + ' kbps';
    },

    pct(c) { return c.storage_limit_bytes ? Math.min(100, Math.round((c.used_bytes / c.storage_limit_bytes) * 100)) : 0; },
    fmt(iso) { return Util.fmt(iso, 'Asia/Jakarta') + ' WIB'; },
    remain(sec) { return Util.remain(sec); },
    bytes(b) { return Util.bytes(b); },

    async logout() {
      await api('/api/logout', { method: 'POST' }).catch(() => {});
      location.href = '/';
    },
  };
}
