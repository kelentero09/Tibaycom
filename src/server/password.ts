import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Native scrypt from the Workers Node.js compatibility layer — far cheaper in CPU time than a pure-JS fallback.
const PARAMS = { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 };
const KEY_LENGTH = 64;

const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, PARAMS, (err, key) => (err ? reject(err) : resolve(key)));
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt);
  return `${salt}:${key.toString('hex')}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [salt, stored] = hash.split(':');
  if (!salt || !stored) return false;
  const key = await derive(password, salt);
  const expected = Buffer.from(stored, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
