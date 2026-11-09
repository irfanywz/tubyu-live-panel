// Login, logout, koneksi stream real-time, dan routing berbasis hash
const VIEWS = ['dashboard', 'create', 'files', 'archive', 'settings'];

const authMixin = {
  me: null,
  view: 'dashboard',
  tz: 'Asia/Jakarta',
  tzOptions: [],
  clock: '',
  login: { username: '', password: '' },
  loginMsg: '',
  loginWarn: '',
  loginBusy: false,
  loginShake: false,
  es: null,
  booted: false,
  theme: 'dark',

  toggleTheme() {
    Theme.toggle();
    this.theme = Theme.get();
  },

  get tzLabel() {
    const o = this.tzOptions.find((z) => z.value === this.tz);
    return o ? o.label : this.tz;
  },

  get clockText() {
    const short = this.tzOptions.find((z) => z.value === this.tz)?.short || '';
    return this.clock + (short ? ' ' + short : '');
  },

  get previewTz() {
    return Util.fmt(new Date().toISOString(), this.tz) + ' (' + this.tzLabel + ')';
  },

  fmt(iso) { return Util.fmt(iso, this.tz); },
  remain(sec) { return Util.remain(sec); },
  bytes(b) { return Util.bytes(b); },
  statusLabel(s) { return Util.statusLabel(s); },

  // Data profil (masa aktif, zona waktu). Tidak untuk data live, itu lewat stream.
  async refresh() {
    try {
      this.me = await api('/api/me');
      if (this.me.role === 'admin') { location.href = '/admin.html'; return; }
      this.tz = this.me.timezone;
      this.tzOptions = this.me.timezones;
      this.connectStream();
      // Saat pertama dibuka (atau di-refresh), muat data halaman yang aktif.
      // Tanpa ini, halaman berkas dan arsip kosong sampai pindah tab.
      if (!this.booted) {
        this.booted = true;
        this.go(this.view);
      }
    } catch (e) {
      if (e.code === 'EXPIRED') {
        this.me = null;
        this.closeStream();
        this.loginWarn = e.message;
      } else if (e.status === 401) {
        this.me = null;
        this.closeStream();
      }
    }
  },

  // Satu koneksi SSE. Browser menyambung ulang sendiri kalau putus.
  connectStream() {
    if (this.es) return;
    this.es = new EventSource('/api/stream');
    this.es.addEventListener('state', (e) => { this.tasks = JSON.parse(e.data); });
    this.es.addEventListener('delta', (e) => { this.tasks = applyDelta(this.tasks, JSON.parse(e.data)); });
    this.es.onerror = () => {
      // readyState CLOSED berarti server menolak (sesi habis). Cek ulang ke /api/me.
      if (this.es && this.es.readyState === EventSource.CLOSED) {
        this.es = null;
        this.refresh();
      }
    };
  },

  closeStream() {
    if (this.es) { this.es.close(); this.es = null; }
  },

  async doLogin() {
    this.loginMsg = '';
    this.loginWarn = '';
    this.loginBusy = true;
    try {
      const res = await api('/api/login', { method: 'POST', body: this.login });
      this.login.password = '';
      if (res.role === 'admin') { location.href = '/admin.html'; return; }
      await this.refresh();
      this.go('dashboard');
    } catch (e) {
      if (e.code === 'EXPIRED') this.loginWarn = e.message;
      else this.loginMsg = e.message;
      this.loginShake = true;
      setTimeout(() => { this.loginShake = false; }, 500);
    } finally {
      this.loginBusy = false;
    }
  },

  // Tempel dari clipboard ke field (path seperti "create.streamKey" atau "fileUrl")
  async paste(path) {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      const keys = path.split('.');
      const last = keys.pop();
      const target = keys.reduce((o, k) => o[k], this);
      target[last] = text;
    } catch (e) {
      alert('Tidak bisa membaca clipboard. Tekan Ctrl+V di kolom tersebut.');
    }
  },

  async logout() {
    this.closeStream();
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    this.me = null;
    this.go('dashboard');
  },

  // Pindah halaman dan simpan di hash supaya tidak balik ke dashboard saat refresh
  go(v) {
    if (!VIEWS.includes(v)) v = 'dashboard';
    const changed = this.view !== v;
    this.view = v;
    if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    if (!this.me) return;
    if (v === 'settings' && changed) this.tzDraft = this.tz;
    if (v === 'dashboard') this.loadTasks().catch(() => {});
    if (v === 'create') { this.createMsg = ''; this.loadFiles().catch(() => {}); }
    if (v === 'files') this.loadFiles().catch(() => {});
    if (v === 'archive') this.loadArchive().catch(() => {});
  },
};
