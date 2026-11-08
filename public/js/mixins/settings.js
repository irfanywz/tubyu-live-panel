// Pengaturan: sandi dan zona waktu
const settingsMixin = {
  pw: { old: '', n1: '', n2: '' },
  pwMsg: '',
  pwOk: false,
  tzDraft: 'Asia/Jakarta',
  tzMsg: '',
  tzOk: false,

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

  async saveTz() {
    this.tzMsg = '';
    try {
      await api('/api/settings/timezone', { method: 'PUT', body: { timezone: this.tzDraft } });
      this.tz = this.tzDraft;
      this.tzOk = true;
      this.tzMsg = 'Zona waktu disimpan.';
    } catch (e) {
      this.tzOk = false;
      this.tzMsg = e.message;
    }
  },
};
