/**
 * Cookie "halaqah terakhir yang dipilih" di layar Evaluasi pengajar.
 *
 * Ditulis klien saat pengajar memilih/membuka halaqah, dibaca page.tsx saat
 * URL tak membawa ?halaqah=. Hanya id — divalidasi ulang di server terhadap
 * daftar halaqah milik pengajar, jadi nilai liar tak membuka apa pun.
 * Berkas terpisah (bukan dari modul 'use client') supaya server component
 * menerima string-nya, bukan client reference.
 */
export const HALAQAH_COOKIE = 'ev_halaqah';
