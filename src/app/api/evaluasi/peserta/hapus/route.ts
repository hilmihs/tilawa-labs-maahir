import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { isPesertaManual } from '@/lib/evaluasi-peserta';
import { tandaiKurasi } from '@/lib/evaluasi-kurasi';

export const runtime = 'nodejs';

/**
 * Keluarkan peserta dari halaqah. Dua perlakuan, sengaja berbeda:
 *
 * - Baris `manual:` → HAPUS sungguhan. Biasanya dihapus karena salah tambah,
 *   dan menyisakan baris mati membuat daftar koordinator berisi nama-nama yang
 *   tak pernah ada. `evaluasi_nilai` ikut terhapus lewat ON DELETE CASCADE.
 * - Baris hilmihs → `aktif=false` (soft delete) + kolom `aktif` ditandai
 *   terkurasi (migrasi 0074). Hapus sungguhan akan dibuat ulang oleh pull
 *   berikutnya sebagai 'create', dan tanpa penanda kurasi upsert apply
 *   menghidupkannya lagi (mapPeserta selalu mengirim aktif=true). Nilai yang
 *   sudah masuk sengaja dibiarkan utuh — peserta bisa dimunculkan lagi dari
 *   sisi data pusat tanpa kehilangan riwayat.
 *
 * `evaluasi_rapot` memakai ON DELETE RESTRICT, jadi peserta yang rapotnya sudah
 * terbit terlindung di tingkat basis data — dicek lebih dulu di sini supaya
 * pesannya bisa dimengerti, bukan galat FK mentah. Cek yang sama berlaku untuk
 * peserta pusat: dokumen ber-QR yang sudah beredar tak boleh merujuk peserta
 * yang hilang dari daftar.
 */
export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { halaqah_id?: unknown; peserta_id?: unknown };
    const halaqahId = body.halaqah_id;
    const pesertaId = body.peserta_id;
    if (typeof halaqahId !== 'string' || !halaqahId) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    if (typeof pesertaId !== 'string' || !pesertaId) {
      return NextResponse.json({ error: 'peserta_id wajib diisi' }, { status: 400 });
    }
    const manual = isPesertaManual(pesertaId);

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', halaqahId)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    const { data: peserta } = await supabaseAdmin
      .from('eval_peserta')
      .select('id, nama, halaqah_id')
      .eq('id', pesertaId)
      .maybeSingle();
    if (!peserta || peserta.halaqah_id !== halaqahId) {
      return NextResponse.json({ error: 'Peserta tidak ada di halaqah ini' }, { status: 404 });
    }

    const { data: rapot } = await supabaseAdmin
      .from('evaluasi_rapot')
      .select('id')
      .eq('peserta_id', pesertaId)
      .limit(1)
      .maybeSingle();
    if (rapot) {
      return NextResponse.json(
        { error: 'Rapot peserta ini sudah diterbitkan. Cabut rapotnya dulu sebelum menghapus.' },
        { status: 409 }
      );
    }

    if (manual) {
      const { error } = await supabaseAdmin.from('eval_peserta').delete().eq('id', pesertaId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, mode: 'hapus' });
    }

    const { error } = await supabaseAdmin
      .from('eval_peserta')
      .update({ aktif: false })
      .eq('id', pesertaId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await tandaiKurasi('eval_peserta', pesertaId, ['aktif']);
    return NextResponse.json({ ok: true, mode: 'nonaktif' });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
