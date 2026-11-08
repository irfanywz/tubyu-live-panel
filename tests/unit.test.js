import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zonedToUtcIso, isValidTz } from '../src/tz.js';
import { parseDriveId } from '../src/drive.js';
import { friendlyError } from '../src/ffmpeg-errors.js';

test('zona waktu WIB dikonversi ke UTC dengan benar', () => {
  assert.equal(zonedToUtcIso('2026-11-08T10:00', 'Asia/Jakarta'), '2026-11-08T03:00:00.000Z');
});

test('zona waktu WITA dikonversi ke UTC dengan benar', () => {
  assert.equal(zonedToUtcIso('2026-11-08T10:00', 'Asia/Makassar'), '2026-11-08T02:00:00.000Z');
});

test('input jadwal yang tidak valid ditolak', () => {
  assert.equal(zonedToUtcIso('bukan-tanggal', 'Asia/Jakarta'), null);
  assert.equal(isValidTz('Mars/Olympus'), false);
});

test('URL Google Drive dikenali, host lain ditolak', () => {
  assert.equal(parseDriveId('https://drive.google.com/file/d/abc_DEF-123/view?usp=sharing'), 'abc_DEF-123');
  assert.equal(parseDriveId('https://drive.google.com/uc?export=download&id=xyz789'), 'xyz789');
  assert.equal(parseDriveId('http://drive.google.com/file/d/abc/view'), null);
  assert.equal(parseDriveId('https://evil.example.com/file/d/abc/view'), null);
});

test('error 10053 diterjemahkan ke pesan yang bisa dipahami', () => {
  const msg = friendlyError(['[tls] IO error: Error number -10053 occurred']);
  assert.match(msg, /diputus/);
});

test('log tanpa error yang dikenal tidak diterjemahkan', () => {
  assert.equal(friendlyError(['frame= 100 fps=25']), null);
});
