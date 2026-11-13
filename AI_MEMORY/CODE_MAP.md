# CODE_MAP

Hanya file penting dan tanggung jawabnya. Nomor baris sengaja tidak ditulis (cepat berubah); cari dengan nama fungsi.

## Backend (`src/`)
| File | Tanggung jawab | Fungsi kunci |
|---|---|---|
| server.js | Route HTTP, SSE, boot, handler error, shutdown | `parseTask` (validasi tugas + cek key + kuota), `parseLocal`, `serializeTask`, `customerTaskRows`, `adminLiveRows`, `broadcastTick`, `diffFor`, `sendStream`, `sendThumb`, `getCustomer`, `audit`, `rangeDays`, `process.on('uncaughtException'/SIGTERM)` |
| runner.js | Spawn FFmpeg, progres, timer, reconnect, stop | `launchTask(id,{resume})`, `onConnected`, `scheduleReconnect`, `stopTask` (cabang pending), `stopAll`, `recoverOnBoot`, `killLeftoverFfmpeg`, `getStats`, `liveUploadKbps`, `liveCount`, `isPendingRestart` |
| scheduler.js | Tick 5 detik | `tick()` (expiry, stop, start, watchdog, repeat), `startScheduler`, `failTask` |
| files.js | Antrean unduhan | `queueDownload`, `processDownload`, `cancelDownload`, `deleteFile`, `usedBytes`, `httpError` |
| drive.js | URL Drive dan unduhan | `parseDriveId`, `downloadDrive(id,dest,max,{onProgress,isCancelled})`, `fetchDrive` |
| limits.js | Kuota paket | `checkQuota`, `usageFor`, `limitsFor` |
| logs.js | Log per tugas (file) | `appendLog`, `readLogs`, `deleteLogs`, `sweepOrphanLogs` |
| repeat.js | Occurrence berulang | `spawnRepeats` |
| monitor.js | Kondisi server | `snapshotNow`, `startMonitor`, `readNetwork`, `readCounters` (linux /proc, win netstat -e, mac netstat -ib) |
| bandwidth.js | Riwayat bandwidth | `addBandwidth`, `recordCustomerSent`, `flushBandwidth`, `bandwidthDaily/Sum`, `customerUsage` |
| checks.js | Pemeriksaan sistem (cache 60 dtk) | `runChecks` |
| ffmpeg-errors.js | Terjemahan error FFmpeg | `friendlyError` (aturan regex) |
| auth.js | Sesi | `requireAuth`, `requireAdmin`, `createSession` |
| crypto.js | Enkripsi key | `encrypt`, `decrypt`, `hintOf`, `keyFingerprint` |
| config.js | Konfigurasi | `config`, `PACKAGES` (A/B/C), `resolveFfmpeg` |
| db.js | Skema & migrasi | `ensureColumn`, drop `task_logs`, tabel `bandwidth_5m`, `usage_customer_daily`, `audit_logs` |
| admin.js | CLI admin | `init-admin`, `add`, `add-admin`, `extend`, `reset`, `set-package`, `list` |
| errors.js | Catat error | `reportError` |
| ratelimit.js | Batas login | `checkLogin`, `failLogin`, `clearLogin` |
| tz.js | Zona waktu | `zonedToUtcIso`, `TIMEZONES`, `isValidTz` |
| doctor.js | CLI pemeriksaan | — |

## Script (`scripts/`)
- `setup.js`: install → FFmpeg bawaan (`npm rebuild ffmpeg-static`) → ENC_KEY → doctor → admin acak.
- `gensecret.js`: membuat ENC_KEY di `.env` (tidak menimpa yang ada).

## Frontend (`public/`)
| File | Isi |
|---|---|
| index.html | Panel customer (login, dashboard, buat tugas, berkas, arsip, pengaturan) |
| admin.html | Panel admin (dashboard, customer, berkas, audit, akun, tentang) |
| js/app.js | `app()`: gabung mixin customer, `init()` (clock, refresh 60 dtk, poll berkas, visibility) |
| js/mixins/auth.js | `refresh`, `connectStream`, `doLogin`, `logout`, `go`, `paste`, `toggleTheme` |
| js/mixins/tasks.js | `loadTasks`, `saveTask`, `saveEdit`, `openEdit`, preset (`applyPreset`), `toggleKey`, `copyKey`, `reuseTask`, `progress`, `liveText` |
| js/mixins/files.js | `loadFiles`, `downloadFile`, `cancelDownload`, `downloadPct`, `delFile`, `openPreview` |
| js/mixins/archive.js | `loadArchive`, `clearArchive`, `clearErrors` |
| js/mixins/settings.js | `changePw`, `saveTz` |
| js/admin-app.js | `adminApp()`: `refreshAll`, `setAuto`, customer actions, `openCustomerTasks`, `openTaskLog`, `createCustomer`, `resetPw`, `accountMessage`, bandwidth helpers |
| js/about.js | `ABOUT_INFO`, `CHANGELOG_LOG` (riwayat untuk pengguna) |
| js/util.js | `Util` (format), `Theme`, `mix`, `applyDelta`, `blankCreate` |
| css/theme.css | Variabel warna terang/gelap, komponen (card, btn, badge, chip, action, mnav) |

## Test
- `tests/unit.test.js` (6 tes: zona waktu, parsing Drive, terjemahan error). Dijalankan pemilik dengan `npm test`.
