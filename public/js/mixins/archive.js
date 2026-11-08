// Arsip: tugas selesai, dihentikan, dan gagal
const archiveMixin = {
  archive: [],

  async loadArchive() {
    this.archive = await api('/api/archive');
  },

  async clearArchive() {
    if (!confirm('Hapus semua arsip (selesai dan dihentikan)?')) return;
    try {
      await api('/api/archive/clear', { method: 'POST' });
      await this.loadArchive();
    } catch (e) { alert(e.message); }
  },

  async clearErrors() {
    if (!confirm('Hapus semua tugas yang gagal?')) return;
    try {
      await api('/api/archive/clear-errors', { method: 'POST' });
      await this.loadArchive();
    } catch (e) { alert(e.message); }
  },
};
