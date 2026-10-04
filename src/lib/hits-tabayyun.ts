// Fungsi MURNI lifecycle tabayyun F3. Tanpa I/O — dipakai server action (guard)
// & UI (label tombol/badge). Diuji: npm run test-tabayyun.

import { HITS_PELANGGARAN_LABEL, HITS_JKG_OPSI_LABEL } from '@/types/db';
import type { HitsPelanggaranJenis } from '@/types/db';

export const TABAYYUN_DEADLINE_HOURS = 72;
const MS_PER_HOUR = 3_600_000;

export type PelanggaranRingkas = {
  jenis: string;
  menit: number | null;
  jkg_opsi?: string | null;
  cicil_n?: number | null;
  badal_nama?: string | null;
  badal_mulai?: string | null;
};

/**
 * Satu pelanggaran → baris ringkas berbahasa manusia. Murni. Dipakai template WA
 * tabayyun, kartu koordinator, DAN halaman token publik — satu sumber kebenaran
 * supaya pengajar tidak pernah cuma disodori kode mentah ("JKG") tanpa arti.
 */
export function describePelanggaran(p: PelanggaranRingkas): string {
  const label = HITS_PELANGGARAN_LABEL[p.jenis as HitsPelanggaranJenis] ?? p.jenis;
  let detail = '';
  if (p.jenis === 'KMT' && p.menit != null) detail = ` — telat ${p.menit} menit`;
  else if (p.jenis === 'KBLA' && p.menit != null) detail = ` — lebih awal ${p.menit} menit`;
  else if (p.jenis === 'JKG' && p.jkg_opsi) {
    detail = ` — ${HITS_JKG_OPSI_LABEL[p.jkg_opsi as 'ganti_hari' | 'cicil'] ?? p.jkg_opsi}`;
    if (p.jkg_opsi === 'cicil' && p.cicil_n) detail += ` (${p.cicil_n}×)`;
  } else if (p.jenis === 'BADAL') {
    detail = p.badal_nama ? ` — oleh ${p.badal_nama}` : '';
    if (p.badal_mulai) detail += p.badal_mulai === 'lebih_awal' ? ' (mulai lebih awal)' : ' (mulai sesuai jadwal)';
  }
  return `${p.jenis} (${label})${detail}`;
}

export type TabayyunGhostingState =
  | 'not_reminded'    // pending, koordinator belum kirim reminder → jam belum jalan
  | 'awaiting_within' // pending, sudah diingatkan, now < deadline
  | 'ghosting'        // pending, sudah diingatkan, now >= deadline (tak respons 72h)
  | 'has_reason'      // pengajar sudah submit alasan (status awaiting_reason)
  | 'decided';        // sudah diputus koordinator

export interface TabayyunStateInput {
  status: string;
  reminder_sent_at: string | null;
  deadline_at: string | null;
}

export function tabayyunGhostingState(t: TabayyunStateInput, nowIso: string): TabayyunGhostingState {
  if (t.status === 'decided') return 'decided';
  if (t.status === 'awaiting_reason') return 'has_reason';
  // status 'pending' (belum ada alasan)
  if (!t.reminder_sent_at) return 'not_reminded';
  if (!t.deadline_at) return 'awaiting_within';
  const now = new Date(nowIso).getTime();
  const deadline = new Date(t.deadline_at).getTime();
  return now >= deadline ? 'ghosting' : 'awaiting_within';
}

/** Sisa jam menuju deadline (negatif = sudah lewat). Null bila belum diingatkan. */
export function tabayyunHoursLeft(t: TabayyunStateInput, nowIso: string): number | null {
  if (!t.reminder_sent_at || !t.deadline_at) return null;
  return (new Date(t.deadline_at).getTime() - new Date(nowIso).getTime()) / MS_PER_HOUR;
}

/** Deadline ISO = reminder_sent_at + 72 jam (kalibrasi jam, bukan hari kalender). */
export function deadlineFromReminder(reminderIso: string): string {
  return new Date(new Date(reminderIso).getTime() + TABAYYUN_DEADLINE_HOURS * MS_PER_HOUR).toISOString();
}

/**
 * Validasi input klaim menit dari pengajar. Murni.
 * `saldo` = sisa hutang halaqah saat ini. Bila saldo 0, form tidak menampilkan
 * field ini, jadi input apa pun diabaikan dan hasilnya 0.
 */
export function validateKlaimMenit(
  raw: string,
  saldo: number
): { menit: number } | { error: string } {
  if (saldo <= 0) return { menit: 0 };
  const s = raw.trim();
  if (!s) return { error: 'Jumlah menit wajib diisi.' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: 'Jumlah menit harus berupa angka.' };
  if (!Number.isInteger(n)) return { error: 'Jumlah menit harus bilangan bulat.' };
  if (n < 0) return { error: 'Menit tidak boleh negatif.' };
  if (n > saldo) {
    return { error: `Menit yang ditunaikan tidak boleh melebihi sisa hutang (${saldo} menit).` };
  }
  return { menit: n };
}

/**
 * Menit yang benar-benar ditulis ke ledger saat koordinator memutus. Murni.
 * Di-cap ke saldo agar tidak overpay (pola sama seperti laporan ketua kelas).
 */
export function capBayarDisetujui(disetujui: number, saldo: number): number {
  if (!Number.isFinite(disetujui) || disetujui <= 0) return 0;
  return Math.min(Math.floor(disetujui), Math.max(0, saldo));
}
