// Token akses publik tabayyun. Dipisah dari hits-tabayyun.ts karena modul itu
// dijaga tetap murni (tanpa I/O) agar bisa diuji & dipakai komponen klien.
import { randomBytes } from 'node:crypto';

/** 32 byte acak base64url (~43 karakter). Cukup untuk tak bisa ditebak. */
export function generateTabayyunToken(): string {
  return randomBytes(32).toString('base64url');
}
