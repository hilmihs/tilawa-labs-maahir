import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { type Jenis } from '@/lib/evaluasi';
import { rapotAktifPenghalangBuka } from '@/lib/evaluasi-kunci';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buka kunci sesi yang sudah dikirim: status kembali 'draft' supaya nilainya
// bisa disunting lagi (atau direset lewat /api/evaluasi/nilai/reset). Nilai
// TIDAK disentuh di sini — membuka dan mengosongkan sengaja dipisah.
//
// Ditolak selama masih ada rapot AKTIF yang bersumber dari sesi ini: dokumen
// ber-QR yang sudah beredar tak boleh diam-diam berbeda dengan isi sistem.
// Cabut rapotnya dulu, baru sesi bisa dibuka.
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

    const body = (await req.json()) as { sesi_id?: unknown };
    const sesi_id = body.sesi_id;
    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }

    const { data: sesi } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, halaqah_id, status, jenis, nomor_sesi')
      .eq('id', sesi_id)
      .maybeSingle();
    if (!sesi) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', sesi.halaqah_id)
      .maybeSingle();
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!halaqah || !evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Sudah draft → tak ada yang perlu dibuka. Idempoten supaya ketukan ganda
    // dari HP dengan koneksi buruk tidak berujung galat.
    if (sesi.status !== 'terkirim') {
      return NextResponse.json({ ok: true, sudah_draft: true });
    }

    // --- Penjaga rapot aktif (dipakai bersama /api/evaluasi/nilai/reset) ---
    const penghalang = await rapotAktifPenghalangBuka(
      sesi.halaqah_id as string,
      sesi.jenis as Jenis,
      sesi.nomor_sesi as number
    );
    if (penghalang) {
      return NextResponse.json(
        { error: penghalang.pesan, rapot_aktif: penghalang.jumlah },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin
      .from('evaluasi_sesi')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('id', sesi_id);
    if (error) {
      console.error('[sesi/buka-kunci] gagal:', error.message);
      return NextResponse.json({ error: 'Gagal membuka kunci sesi' }, { status: 500 });
    }

    void logAudit({
      actor: pengajar as never,
      action: 'evaluasi.sesi.buka_kunci',
      targetTable: 'evaluasi_sesi',
      targetId: sesi_id,
      detail: { halaqah_id: sesi.halaqah_id, jenis: sesi.jenis, nomor_sesi: sesi.nomor_sesi },
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error('[sesi/buka-kunci] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal membuka kunci sesi' }, { status: 500 });
  }
}
