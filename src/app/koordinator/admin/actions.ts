'use server';

import bcrypt from 'bcryptjs';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { runSeedItsnain } from '@/lib/seeds/seed-itsnain';
import { runSeedMaahir } from '@/lib/seeds/seed-maahir';
import { runSeedSyaikh } from '@/lib/seeds/seed-syaikh';
import { runSeedPesertaPassword } from '@/lib/seeds/seed-peserta-password';
import { runResetSetoran } from '@/lib/seeds/reset-setoran';
import { runSeedHits } from '@/lib/seeds/seed-hits';
import { runSeedKelasHits } from '@/lib/seeds/seed-kelas-hits';
import { runSeedDemoObservasi } from '@/lib/seeds/seed-demo-observasi';

export type SeedKey =
  | 'itsnain'
  | 'maahir'
  | 'syaikh'
  | 'peserta-password'
  | 'reset-setoran'
  | 'hits'
  | 'kelas-hits'
  | 'demo-observasi';

interface SeedDef {
  label: string;
  fn: (log: (s: string) => void) => Promise<void>;
}

const REGISTRY: Record<SeedKey, SeedDef> = {
  itsnain: {
    label: 'Seed Akhwat (Itsnain Fi Wahid)',
    fn: runSeedItsnain,
  },
  maahir: {
    label: 'Seed Ikhwan (Maahir)',
    fn: runSeedMaahir,
  },
  syaikh: {
    label: 'Seed Syaikh/Ustadzah',
    fn: runSeedSyaikh,
  },
  'peserta-password': {
    label: 'Backfill password peserta',
    fn: runSeedPesertaPassword,
  },
  'reset-setoran': {
    label: 'Reset semua setoran + rekaman',
    fn: runResetSetoran,
  },
  hits: {
    label: 'Seed HITS (kelompok + pengajar + kehadiran)',
    fn: runSeedHits,
  },
  'kelas-hits': {
    label: 'Seed Kelas HITS (94 kelas + ketua kelas dari Excel)',
    fn: runSeedKelasHits,
  },
  'demo-observasi': {
    label: 'Demo Observasi + Tabayyun + Checkin',
    fn: runSeedDemoObservasi,
  },
};

export type SeedResult = {
  ok?: boolean;
  error?: string;
  log?: string[];
};

export async function runSeed(
  _prev: SeedResult | undefined,
  formData: FormData
): Promise<SeedResult> {
  try {
    const s = await getSession();
    if (!s.session || s.session.role !== 'koordinator') {
      return { error: 'Akses ditolak.' };
    }
    const seedKey = String(formData.get('seed') ?? '') as SeedKey;
    const password = String(formData.get('password') ?? '');
    const def = REGISTRY[seedKey];
    if (!def) return { error: 'Seed tidak dikenal.' };
    if (!password) return { error: 'Password wajib diisi.' };

    // Verifikasi password koordinator (pola sama dengan changePassword di src/lib/auth.ts).
    const { data: row } = await supabaseAdmin
      .from('koordinator')
      .select('password_hash')
      .eq('id', s.session.koordinator_id)
      .maybeSingle();
    if (!row?.password_hash) return { error: 'Akun koordinator tidak ditemukan.' };
    const okPass = await bcrypt.compare(password, row.password_hash);
    if (!okPass) return { error: 'Password salah.' };

    const log: string[] = [];
    const push = (line: string) => {
      log.push(line);
      console.log(`[seed:${seedKey}] ${line}`);
    };
    push(`[${new Date().toISOString()}] ${s.session.name} menjalankan: ${def.label}`);
    try {
      await def.fn(push);
      push('✓ Selesai.');
      return { ok: true, log };
    } catch (e) {
      push(`✗ Error: ${e instanceof Error ? e.message : String(e)}`);
      return { error: 'Eksekusi gagal — cek log.', log };
    }
  } catch (e) {
    // Defensive outer catch — jamin useFormState selalu dapat state baru.
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[runSeed] unexpected error:', e);
    return { error: `Error tak terduga: ${msg}` };
  }
}
