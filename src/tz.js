export const TIMEZONES = [
  { value: 'Asia/Jakarta', label: 'WIB - Waktu Indonesia Barat (UTC+7)', short: 'WIB' },
  { value: 'Asia/Makassar', label: 'WITA - Waktu Indonesia Tengah (UTC+8)', short: 'WITA' },
  { value: 'Asia/Jayapura', label: 'WIT - Waktu Indonesia Timur (UTC+9)', short: 'WIT' },
  { value: 'Asia/Singapore', label: 'Singapura (UTC+8)', short: 'SGT' },
  { value: 'Asia/Kuala_Lumpur', label: 'Malaysia (UTC+8)', short: 'MYT' },
  { value: 'Asia/Bangkok', label: 'Thailand (UTC+7)', short: 'ICT' },
  { value: 'Asia/Tokyo', label: 'Jepang (UTC+9)', short: 'JST' },
  { value: 'Europe/London', label: 'London (UTC+0/+1)', short: 'London' },
  { value: 'America/New_York', label: 'New York (UTC-5/-4)', short: 'NY' },
  { value: 'UTC', label: 'UTC', short: 'UTC' },
];

const VALID = new Set(TIMEZONES.map((t) => t.value));
export const isValidTz = (tz) => VALID.has(tz);

// Selisih (ms) antara jam dinding zona tz dengan UTC pada waktu utcMs
function offsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// Ubah "2026-11-08T10:30" (jam dinding di zona tz) menjadi ISO UTC
export function zonedToUtcIso(localStr, tz) {
  const m = String(localStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - offsetMs(wall, tz);
  guess = wall - offsetMs(guess, tz);
  const d = new Date(guess);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
