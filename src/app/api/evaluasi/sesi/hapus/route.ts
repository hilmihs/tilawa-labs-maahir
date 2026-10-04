import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';

export const runtime = 'nodejs';

// Restore satu sesi ujian akhir untuk sebuah halaqah.
//
// Sejak sumbu rapot dirotasi ke track, tiap track punya ujian akhirnya sendiri:
// nomor_sesi 1 = Ujian QN, nomor_sesi 2 = Ujian PB, masing-masing menyumbang 70%
// nilai akhir rapot track-nya. Keduanya karena itu WAJIB ada — penghapusan sesi
// ujian ditolak (dulu hanya disyaratkan "minimal 1 tersisa", yang membuat
// pengajar bisa menghapus Ujian PB dan mengunci Rapot PB selamanya tanpa pesan
// error apa pun). Pemulihan (dihapus=false) tetap dilayani supaya tombstone
// lama bisa dibalikkan. Sesi berkala (qn/pb) tidak ditangani endpoint ini.
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

    const body = await req.json();
    const { halaqah_id, nomor_sesi, dihapus, jenis } = body as {
      halaqah_id: string;
      nomor_sesi: number;
      dihapus: boolean;
      jenis?: string;
    };

    if (typeof halaqah_id !== 'string' || !halaqah_id) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    if (!Number.isInteger(nomor_sesi) || nomor_sesi < 1 || nomor_sesi > 4) {
      return NextResponse.json({ error: 'nomor_sesi harus 1..4' }, { status: 400 });
    }
    if (typeof dihapus !== 'boolean') {
      return NextResponse.json({ error: 'dihapus harus boolean' }, { status: 400 });
    }
    // Endpoint ini khusus sesi ujian; jangan sampai payload berjenis lain
    // diam-diam mengenai baris ujian.
    if (jenis !== undefined && jenis !== 'ujian') {
      return NextResponse.json(
        { error: 'Endpoint ini hanya untuk sesi ujian' },
        { status: 400 }
      );
    }
    // Kedua sesi ujian wajib ada — penghapusan ditolak, apa pun sisanya.
    if (dihapus) {
      return NextResponse.json(
        { error: 'Ujian QN dan Ujian PB wajib ada — tidak bisa dihapus.' },
        { status: 409 }
      );
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    const { data: existing } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, status')
      .eq('halaqah_id', halaqah_id)
      .eq('jenis', 'ujian')
      .eq('nomor_sesi', nomor_sesi)
      .maybeSingle();

    // Sisanya pasti pemulihan (dihapus=false) — penghapusan sudah ditolak di
    // atas, jadi tak ada lagi jalur tombstone/penjagaan "minimal 1 tersisa".
    if (existing) {
      // Row sudah ada → cukup toggle flag; JANGAN upsert (upsert tanpa surat/ayat
      // akan mereset silabus ke default DB → sesi hantu Al-Baqarah 142-157).
      const { error } = await supabaseAdmin
        .from('evaluasi_sesi')
        .update({ dihapus: false, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) {
        console.error('[sesi/hapus] update gagal:', error.message);
        return NextResponse.json({ error: 'Gagal memperbarui sesi' }, { status: 500 });
      }
    }
    // else: memulihkan sesi yang belum pernah ada → no-op.

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[sesi/hapus] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal memproses sesi' }, { status: 500 });
  }
}
