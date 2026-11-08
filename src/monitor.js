// Kondisi server. Dibaca saat Refresh atau auto refresh, dan sekali tiap 5 menit di latar belakang
// untuk riwayat bandwidth. Jaringan dibaca tanpa PowerShell:
//   Linux   : /proc/net/dev
//   Windows : netstat -e
//   macOS   : netstat -ib
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { config } from './config.js';
import { reportError } from './errors.js';
import { addBandwidth } from './bandwidth.js';

const BACKGROUND_MS = 5 * 60_000;
const CPU_WINDOW_MS = 300;
const CMD_TIMEOUT_MS = 3000;

// Spesifikasi yang tidak berubah selama server berjalan. Dibaca sekali saat modul dimuat.
const cpuList = os.cpus();
const SPECS = {
  hostname: os.hostname(),
  osName: `${os.type()} ${os.release()}`,
  arch: os.arch(),
  cpuModel: (cpuList[0]?.model || 'tidak diketahui').replace(/\s+/g, ' ').trim(),
  cpuCores: cpuList.length,
  ramTotal: os.totalmem(),
  nodeVersion: process.version,
};

let latest = null;
let inflight = null;
let prevNet = null;   // { rx, tx, t } counter terakhir untuk menghitung kecepatan

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (n) => Math.round(n * 10) / 10;

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: CMD_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.toString());
    });
  });
}

// Total byte masuk dan keluar dari semua interface non-loopback
async function readCounters() {
  const p = os.platform();

  if (p === 'linux') {
    const lines = fs.readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
    let rx = 0;
    let tx = 0;
    let found = false;
    for (const line of lines) {
      const m = line.match(/^\s*([^:]+):\s*(.*)$/);
      if (!m || m[1].trim() === 'lo') continue;
      const f = m[2].trim().split(/\s+/).map(Number);
      rx += f[0] || 0;
      tx += f[8] || 0;
      found = true;
    }
    return found ? { rx, tx } : null;
  }

  if (p === 'win32') {
    // Output netstat -e: baris "Bytes  <terima>  <kirim>" (atau "Byte" di locale Indonesia)
    const text = await run('netstat', ['-e']);
    const m = text.match(/^\s*Bytes?\s+(\d+)\s+(\d+)/mi);
    return m ? { rx: Number(m[1]), tx: Number(m[2]) } : null;
  }

  if (p === 'darwin') {
    // Kolom Ibytes dan Obytes dicari dari header. Baris "<Link#...>" berisi total per interface.
    const lines = (await run('netstat', ['-ib'])).split('\n');
    const header = lines.find((l) => /Ibytes/.test(l));
    if (!header) return null;
    const cols = header.trim().split(/\s+/);
    const iIdx = cols.indexOf('Ibytes');
    const oIdx = cols.indexOf('Obytes');
    const seen = new Set();
    let rx = 0;
    let tx = 0;
    for (const line of lines) {
      const f = line.trim().split(/\s+/);
      if (f.length <= Math.max(iIdx, oIdx) || !f[2] || !f[2].startsWith('<Link')) continue;
      if (f[0].startsWith('lo') || seen.has(f[0])) continue;
      seen.add(f[0]);
      rx += Number(f[iIdx]) || 0;
      tx += Number(f[oIdx]) || 0;
    }
    return { rx, tx };
  }

  return null;
}

// Mengembalikan kecepatan (dihitung dari selisih counter) dan selisih byte untuk riwayat
async function readNetwork() {
  const c = await readCounters();
  if (!c) return { net: null, dUp: null, dDown: null };

  const now = Date.now();
  const prev = prevNet;
  prevNet = { rx: c.rx, tx: c.tx, t: now };

  // Counter yang turun berarti server restart, selisihnya dimulai dari nol
  const dDown = prev ? (c.rx >= prev.rx ? c.rx - prev.rx : c.rx) : null;
  const dUp = prev ? (c.tx >= prev.tx ? c.tx - prev.tx : c.tx) : null;
  const secs = prev ? (now - prev.t) / 1000 : 0;

  return {
    net: {
      downKbps: secs > 0 ? Math.round((dDown * 8) / 1000 / secs) : null,
      upKbps: secs > 0 ? Math.round((dUp * 8) / 1000 / secs) : null,
      downTotal: c.rx,   // sejak boot
      upTotal: c.tx,
    },
    dUp,
    dDown,
  };
}

function diskUsage() {
  for (const dir of [path.resolve(config.storageDir), config.root]) {
    try {
      const s = fs.statfsSync(dir);
      const size = s.blocks * s.bsize;
      const used = size - s.bavail * s.bsize;
      return { total: size, used, pct: size ? Math.round((used / size) * 100) : 0 };
    } catch { /* coba folder berikutnya */ }
  }
  return null;
}

function cpuTotals() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

async function measure() {
  const cpu0 = cpuTotals();
  const t0 = Date.now();

  let net = null;
  let dUp = null;
  let dDown = null;
  try {
    ({ net, dUp, dDown } = await readNetwork());
  } catch (err) {
    reportError('monitor-net', err);
  }

  // CPU diukur dari dua titik. Kalau pembacaan jaringan cepat, tunggu sebentar.
  const waited = Date.now() - t0;
  if (waited < CPU_WINDOW_MS) await sleep(CPU_WINDOW_MS - waited);
  const cpu1 = cpuTotals();
  const cpuPct = cpu1.total > cpu0.total
    ? Math.round((1 - (cpu1.idle - cpu0.idle) / (cpu1.total - cpu0.total)) * 100)
    : null;

  if (dUp !== null && dDown !== null) addBandwidth(dUp, dDown);

  const ramTotal = os.totalmem();
  const ramUsed = ramTotal - os.freemem();
  latest = {
    sampledAt: Date.now(),
    specs: SPECS,
    cpuPct,
    cpuCores: os.cpus().length,
    ramTotal,
    ramUsed,
    ramPct: ramTotal ? Math.round((ramUsed / ramTotal) * 100) : 0,
    disk: diskUsage(),
    network: net,
    load: os.platform() === 'win32' ? null : round1(os.loadavg()[0]),
    uptimeSec: Math.floor(os.uptime()),
    appRss: process.memoryUsage().rss,
    platform: os.platform(),
  };
  return latest;
}

// Satu pengambilan sekaligus. Pemanggil berikutnya ikut menunggu hasil yang sama.
export function snapshotNow() {
  if (!inflight) inflight = measure().finally(() => { inflight = null; });
  return inflight;
}

export function startMonitor() {
  snapshotNow().catch((err) => reportError('monitor', err));
  const timer = setInterval(() => {
    snapshotNow().catch((err) => reportError('monitor', err));
  }, BACKGROUND_MS);
  timer.unref();
}
