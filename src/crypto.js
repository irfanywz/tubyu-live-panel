import crypto from 'node:crypto';
import { config } from './config.js';

function key() {
  const k = Buffer.from(config.encKey, 'hex');
  if (k.length !== 32) {
    throw new Error('ENC_KEY harus 64 karakter hex (32 byte). Jalankan: npm run gensecret');
  }
  return k;
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString('base64')).join('.');
}

export function decrypt(payload) {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// Hanya 4 karakter depan dan belakang yang ditampilkan di UI
export function hintOf(streamKey) {
  return `${streamKey.slice(0, 4)}-****-${streamKey.slice(-4)}`;
}

// Sidik jari key untuk mengecek duplikasi, tanpa menyimpan key dalam bentuk teks
export function keyFingerprint(streamKey) {
  return crypto.createHmac('sha256', key()).update(streamKey).digest('hex');
}
