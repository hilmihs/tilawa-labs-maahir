import { randomInt } from 'crypto';

// Alfabet tanpa karakter ambigu (0/O/o, I/l/1)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generateReadablePassword(length = 10): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
