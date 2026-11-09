// Berkas video: download, thumbnail, preview, dan info penyimpanan
const filesMixin = {
  files: [],
  fileUrl: '',
  fileMsg: '',
  fileOk: false,
  preview: null,   // file yang sedang di-preview (modal global)

  async loadFiles() {
    this.files = await api('/api/files');
  },

  get readyFiles() { return this.files.filter((f) => f.status === 'ready'); },

  get storage() {
    if (!this.me) return { used: 0, limit: 1, free: 1, pct: 0 };
    const { limit, used } = this.me.storage;
    const free = Math.max(0, limit - used);
    return { used, limit, free, pct: Math.min(100, Math.round((used / limit) * 100)) };
  },

  fileBadge(f) {
    return f.status === 'ready' ? 'b-finished' : (f.status === 'failed' ? 'b-failed' : 'b-scheduled');
  },

  fileLabel(f) {
    return f.status === 'ready' ? 'Siap' : (f.status === 'failed' ? 'Gagal' : 'Mengunduh');
  },

  thumbUrl(f) { return `/api/files/${f.id}/thumb`; },
  streamUrl(f) { return `/api/files/${f.id}/stream`; },

  openPreview(f) { this.preview = f; },
  closePreview() { this.preview = null; },

  async downloadFile() {
    this.fileMsg = '';
    try {
      await api('/api/files', { method: 'POST', body: { url: this.fileUrl } });
      this.fileUrl = '';
      this.fileOk = true;
      this.fileMsg = 'Download dimulai. Status akan berubah otomatis.';
      await this.loadFiles();
    } catch (e) {
      this.fileOk = false;
      this.fileMsg = e.message;
    }
  },

  // Persentase unduhan, null kalau ukuran total belum diketahui
  downloadPct(f) {
    if (!f.total_bytes) return null;
    return Math.min(100, Math.round((f.progress_bytes / f.total_bytes) * 100));
  },

  downloadPctText(f) {
    const p = this.downloadPct(f);
    return p === null ? '' : p + '%';
  },

  downloadText(f) {
    const done = Util.bytes(f.progress_bytes || 0);
    return f.total_bytes ? `${done} dari ${Util.bytes(f.total_bytes)}` : `${done} diterima`;
  },

  async cancelDownload(f) {
    if (!confirm('Batalkan unduhan ini?')) return;
    try {
      await api(`/api/files/${f.id}/cancel`, { method: 'POST' });
      await this.loadFiles();
    } catch (e) { alert(e.message); }
  },

  async delFile(f) {
    if (!confirm('Hapus file ini dari server?')) return;
    try {
      await api(`/api/files/${f.id}`, { method: 'DELETE' });
      await this.loadFiles();
    } catch (e) { alert(e.message); }
  },
};
