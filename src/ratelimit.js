// Rate limit sederhana di memori: maks 5 gagal login per 15 menit, lalu kunci 15 menit.
// Reset saat server restart, cukup untuk MVP.
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;

const attempts = new Map(); // key -> { count, first, lockedUntil }

// Mengembalikan sisa detik kalau masih dikunci, 0 kalau boleh mencoba
export function checkLogin(key) {
  const e = attempts.get(key);
  const now = Date.now();
  if (e && e.lockedUntil > now) return Math.ceil((e.lockedUntil - now) / 1000);
  return 0;
}

export function failLogin(key) {
  const now = Date.now();
  let e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) e = { count: 0, first: now, lockedUntil: 0 };
  e.count += 1;
  if (e.count >= MAX_FAILS) {
    e.lockedUntil = now + LOCK_MS;
    e.count = 0;
    e.first = now;
  }
  attempts.set(key, e);
}

export function clearLogin(key) {
  attempts.delete(key);
}

// Buang entri yang sudah lewat jendela waktunya, supaya peta tidak tumbuh tanpa batas
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, e] of attempts) {
    if (e.lockedUntil <= now && now - e.first > WINDOW_MS) attempts.delete(key);
  }
}, 10 * 60_000);
sweeper.unref();
