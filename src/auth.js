import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

export const hashPassword = (p) => bcrypt.hashSync(p, 12);
export const checkPassword = (p, h) => bcrypt.compareSync(p, h);
export const isExpired = (user) => new Date(user.expires_at) <= new Date();

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
  return token;
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function setSessionCookie(res, token) {
  const parts = [`sid=${token}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${60 * 60 * 24 * 7}`];
  if (config.cookieSecure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export function requireAuth(req, res, next) {
  const token = readCookie(req, 'sid');
  if (!token) return res.status(401).json({ message: 'Belum login' });

  const user = db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
  ).get(token);
  if (!user) return res.status(401).json({ message: 'Sesi tidak valid, silakan login ulang' });

  if (isExpired(user)) {
    destroySession(token);
    return res.status(403).json({
      code: 'EXPIRED',
      message: 'Masa aktif Anda sudah habis. Hubungi admin untuk perpanjangan.',
    });
  }

  if (user.disabled) {
    destroySession(token);
    return res.status(403).json({ code: 'DISABLED', message: 'Akun Anda dinonaktifkan. Hubungi admin.' });
  }

  req.user = user;
  req.token = token;
  next();
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Khusus admin' });
    next();
  });
}
