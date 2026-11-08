// Komponen utama. Menggabungkan semua mixin.
function app() {
  const base = {
    init() {
      const initial = location.hash.slice(1);
      this.view = VIEWS.includes(initial) ? initial : 'dashboard';
      this.theme = Theme.get();
      window.addEventListener('hashchange', () => this.go(location.hash.slice(1)));

      setInterval(() => {
        this.clock = new Intl.DateTimeFormat('id-ID', {
          timeZone: this.tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        }).format(new Date());
      }, 1000);

      // Profil cukup disegarkan sesekali. Data live datang lewat stream.
      setInterval(() => this.refresh(), 60_000);

      // Berkas hanya di-poll selama ada yang sedang diunduh
      setInterval(() => {
        if (this.view === 'files' && this.files.some((f) => f.status === 'downloading')) {
          this.loadFiles().catch(() => {});
        }
      }, 3000);

      // Tab tersembunyi tidak perlu koneksi. Saat kembali, sinkronkan.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.closeStream();
        } else if (this.me) {
          this.connectStream();
          this.refresh();
          this.go(this.view);
        }
      });

      this.refresh();
    },
  };
  return mix(base, authMixin, tasksMixin, filesMixin, archiveMixin, settingsMixin);
}
