// Dashboard, tugas, log, dan stream key
const tasksMixin = {
  tasks: [],
  taskQ: '',
  taskFilter: '',
  revealed: {},       // taskId -> stream key (hanya yang sedang ditampilkan)
  logsFor: null,      // tugas yang log-nya sedang dibuka (modal global)
  logsText: '',
  create: blankCreate(),
  createMsg: '',
  createOk: false,

  async loadTasks() {
    this.tasks = await api('/api/tasks');
  },

  get visibleTasks() {
    const q = this.taskQ.trim().toLowerCase();
    const order = { live: 0, scheduled: 1, idle: 2 };
    return this.tasks
      .filter((t) => (!q || t.title.toLowerCase().includes(q)) && (!this.taskFilter || t.status === this.taskFilter))
      .sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  },
  get liveCount() { return this.tasks.filter((t) => t.status === 'live').length; },
  get schedCount() { return this.tasks.filter((t) => t.status === 'scheduled').length; },

  jadwalText(t) {
    if (t.status === 'scheduled') {
      return 'Mulai ' + Util.fmt(t.scheduled_start_utc, this.tz)
        + (t.stop_at_utc ? ' · Stop ' + Util.fmt(t.stop_at_utc, this.tz) : '');
    }
    if (t.stop_at_utc) return 'Stop ' + Util.fmt(t.stop_at_utc, this.tz);
    return '-';
  },

  repeatText(t) {
    if (t.repeat_rule === 'daily') return 'ulang harian';
    if (t.repeat_rule === 'weekly') return 'ulang mingguan';
    return '';
  },

  // Teks status live: bitrate, kecepatan, durasi, dan peringatan kalau data FFmpeg berhenti masuk
  liveText(t) {
    if (t.status !== 'live') return '-';
    const st = t.stats;
    if (!st) return 'Menunggu data dari FFmpeg...';
    if (st.age_sec > 15) return `⚠ Tidak ada data sejak ${st.age_sec} detik`;
    const parts = [];
    if (st.bitrate) parts.push(st.bitrate);
    if (st.speed) parts.push(st.speed);
    if (st.out_sec != null) parts.push('diproses ' + Util.remain(st.out_sec));
    if (st.total_size) parts.push(Util.bytes(st.total_size) + ' terkirim');
    return parts.join(' · ') || 'Live';
  },

  pengulanganText(t) {
    return ({ none: 'Tidak ada', daily: 'Harian', weekly: 'Mingguan' })[t.repeat_rule] || 'Tidak ada';
  },

  autoStopText(t) {
    if (t.stop_at_utc) return 'Stop ' + Util.fmt(t.stop_at_utc, this.tz);
    if (t.duration_sec) {
      const h = Math.floor(t.duration_sec / 3600);
      const m = Math.floor((t.duration_sec % 3600) / 60);
      return `${h} jam ${m} menit`;
    }
    return 'Tidak ada';
  },

  // ----- preset form buat tugas -----
  presetKey: '',
  presetTime: '19:00',

  // Tanggal dan jam saat ini di zona waktu user, format "YYYY-MM-DDTHH:mm"
  nowLocal() {
    return Util.toLocalInput(new Date().toISOString(), this.tz);
  },

  // Jam tertentu berikutnya dalam zona waktu user (hari ini kalau belum lewat, besok kalau sudah)
  nextAt(hhmm) {
    const [date] = this.nowLocal().split('T');
    let cand = `${date}T${hhmm}`;
    if (cand <= this.nowLocal()) {
      const d = new Date(date + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 1);
      cand = `${d.toISOString().slice(0, 10)}T${hhmm}`;
    }
    return cand;
  },

  applyPreset(key) {
    this.presetKey = key;
    if (key === 'manual') {
      this.create = { ...this.create, startAt: '', stopAt: '', hours: 0, mins: 0, repeat: 'none' };
    } else if (key === 'nanti') {
      // 10 menit dari sekarang, durasi 2 jam, sekali saja
      const t = Util.toLocalInput(new Date(Date.now() + 10 * 60_000).toISOString(), this.tz);
      this.create = { ...this.create, startAt: t, stopAt: '', hours: 2, mins: 0, repeat: 'none' };
    } else if (key === 'harian' || key === 'mingguan') {
      this.create = {
        ...this.create,
        startAt: this.nextAt(this.presetTime),
        stopAt: '',
        hours: 2,
        mins: 0,
        repeat: key === 'harian' ? 'daily' : 'weekly',
      };
    }
  },

  get presetSummary() {
    const c = this.create;
    if (this.presetKey === 'manual') return 'Dimulai manual lewat tombol Mulai di dashboard.';
    const when = c.startAt ? c.startAt.replace('T', ' ') + ' ' + (this.tzOptions.find((z) => z.value === this.tz)?.short || '') : '-';
    const dur = Number(c.hours) || Number(c.mins) ? `berhenti otomatis setelah ${c.hours} jam ${c.mins} menit` : 'tanpa auto-stop';
    const rep = c.repeat === 'daily' ? ', diulang setiap hari' : (c.repeat === 'weekly' ? ', diulang setiap minggu' : '');
    return `Mulai ${when}, ${dur}${rep}.`;
  },

  // ----- edit tugas -----
  editTask: null,
  editForm: blankCreate(),
  editMsg: '',

  async openEdit(t) {
    if (t.status === 'live') return;
    try { await this.loadFiles(); } catch (e) { /* daftar file tetap dicoba */ }
    const useDuration = !!t.duration_sec;
    const h = useDuration ? Math.floor(t.duration_sec / 3600) : 0;
    const m = useDuration ? Math.floor((t.duration_sec % 3600) / 60) : 0;
    this.editForm = {
      ...blankCreate(),
      title: t.title,
      fileId: String(t.file_id),
      streamKey: '',
      startAt: Util.toLocalInput(t.scheduled_start_utc, this.tz),
      stopAt: useDuration ? '' : Util.toLocalInput(t.stop_at_utc, this.tz),
      hours: h,
      mins: m,
      repeat: t.repeat_rule || 'none',
    };
    this.editMsg = '';
    this.editTask = t;
  },

  closeEdit() {
    this.editTask = null;
    this.editMsg = '';
  },

  async saveEdit() {
    this.editMsg = '';
    try {
      await api(`/api/tasks/${this.editTask.id}`, {
        method: 'PATCH',
        body: {
          title: this.editForm.title,
          fileId: this.editForm.fileId,
          streamKey: this.editForm.streamKey,
          startAt: this.editForm.startAt || null,
          stopAt: this.editForm.stopAt || null,
          durationMin: Number(this.editForm.hours) * 60 + Number(this.editForm.mins),
          repeat: this.editForm.repeat,
        },
      });
      this.closeEdit();
      await this.loadTasks();
    } catch (e) {
      this.editMsg = e.message;
    }
  },

  // Progres auto-stop: null kalau tidak ada batas waktu
  progress(t) {
    if (!t.started_at || !t.stop_at_utc) return null;
    const start = Date.parse(t.started_at);
    const end = Date.parse(t.stop_at_utc);
    if (!(end > start)) return null;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  },

  get statusCounts() {
    return {
      all: this.tasks.length,
      live: this.tasks.filter((t) => t.status === 'live').length,
      scheduled: this.tasks.filter((t) => t.status === 'scheduled').length,
      idle: this.tasks.filter((t) => t.status === 'idle').length,
    };
  },

  async startTask(t) {
    try {
      await api(`/api/tasks/${t.id}/start`, { method: 'POST' });
      this.go('dashboard');
    } catch (e) { alert(e.message); }
  },

  async stopTask(t) {
    try {
      await api(`/api/tasks/${t.id}/stop`, { method: 'POST' });
      await this.loadTasks();
    } catch (e) { alert(e.message); }
  },

  async delTask(t) {
    if (!confirm('Hapus tugas ini?')) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: 'DELETE' });
      await this.loadTasks();
    } catch (e) { alert(e.message); }
  },

  async showLogs(t) {
    try {
      const logs = await api(`/api/tasks/${t.id}/logs`);
      this.logsText = logs.map((l) => `[${Util.fmt(l.at, this.tz)}] ${l.message}`).join('\n') || 'Belum ada log';
      this.logsFor = t;
    } catch (e) { alert(e.message); }
  },

  // ----- stream key -----
  async fetchKey(t) {
    const r = await api(`/api/tasks/${t.id}/key`);
    return r.key;
  },

  async toggleKey(t) {
    if (this.revealed[t.id]) {
      const copy = { ...this.revealed };
      delete copy[t.id];
      this.revealed = copy;
      return;
    }
    try {
      const key = await this.fetchKey(t);
      this.revealed = { ...this.revealed, [t.id]: key };
    } catch (e) { alert(e.message); }
  },

  copiedId: null,

  async copyKey(t) {
    try {
      const key = this.revealed[t.id] || await this.fetchKey(t);
      await navigator.clipboard.writeText(key);
      this.copiedId = t.id;
      setTimeout(() => { if (this.copiedId === t.id) this.copiedId = null; }, 1500);
    } catch (e) {
      alert('Gagal menyalin: ' + e.message);
    }
  },

  // Buat tugas baru dengan judul, video, dan stream key dari tugas lama
  async reuseTask(t) {
    try {
      const key = await this.fetchKey(t);
      this.create = { ...blankCreate(), title: t.title, fileId: String(t.file_id), streamKey: key };
      this.createMsg = '';
      this.go('create');
    } catch (e) { alert(e.message); }
  },

  async saveTask() {
    this.createMsg = '';
    try {
      await api('/api/tasks', {
        method: 'POST',
        body: {
          title: this.create.title,
          fileId: this.create.fileId,
          streamKey: this.create.streamKey,
          startAt: this.create.startAt || null,
          stopAt: this.create.stopAt || null,
          durationMin: Number(this.create.hours) * 60 + Number(this.create.mins),
          repeat: this.create.repeat,
        },
      });
      this.createOk = true;
      this.createMsg = 'Tugas tersimpan.';
      this.create = blankCreate();
      this.presetKey = '';
      setTimeout(() => this.go('dashboard'), 600);
    } catch (e) {
      this.createOk = false;
      this.createMsg = e.message;
    }
  },
};
