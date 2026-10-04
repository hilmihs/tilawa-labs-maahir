import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { type Jenis } from '@/lib/evaluasi';
import { rapotAktifPenghalangBuka } from '@/lib/evaluasi-kunci';
import { logAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reset (hapus) nilai satu sesi — seluruh peserta, atau satu peserta bila
// peserta_id diberikan. Beraudit.
//
// Layar pengajar kini memakai reset PER PESERTA sebagai bawaan; reset seluruh
// sesi hanya lewat konfirmasi kedua yang menyebut jumlah peserta. Dulu tombol
// Reset di daftar peserta mengirim sesi_id saja dan menghapus nilai SEMUA
// peserta — dipakai untuk membetulkan satu orang, menghapus sekelas.
//
// Sesi 'terkirim' dulu ditolak mentah ("tak bisa direset"), sehingga pengajar
// harus membuka kunci dari kartu riwayat lebih dulu — dua layar berbeda untuk
// satu maksud, dan tombol Reset di layar daftar cuma memunculkan galat. Kini
// sesi terkirim ikut dibuka di sini (status kembali 'draft') memakai penjaga
// yang sama dengan /api/evaluasi/sesi/buka-kunci: rapot AKTIF tetap menghalangi.
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

    const body = (await req.json()) as { sesi_id?: unknown; peserta_id?: unknown };
    const sesi_id = body.sesi_id;
    const peserta_id = body.peserta_id;
    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }
    if (peserta_id !== undefined && (typeof peserta_id !== 'string' || !peserta_id)) {
      return NextResponse.json({ error: 'peserta_id tidak valid' }, { status: 400 });
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

    // Sesi terkirim: buka dulu, dengan penjaga rapot yang sama. Urutannya
    // penting — status dikembalikan ke 'draft' SEBELUM nilai dihapus supaya tak
    // ada jendela di mana sesi berstatus terkirim tapi isinya sudah kosong.
    const terkirim = sesi.status === 'terkirim';
    // Reset satu peserta TIDAK ikut membuka sesi terkirim: membuka mengubah
    // status seluruh sesi (keluar dari data koordinator) — akibat yang terlalu
    // besar untuk ketukan "kosongkan satu orang". Buka kuncinya dulu, terang-terangan.
    if (terkirim && typeof peserta_id === 'string') {
      return NextResponse.json(
        {
          error:
            'Sesi ini sudah dikirim ke koordinator. Buka kunci sesi dulu, baru nilai satu peserta bisa dikosongkan.',
          terkirim: true,
        },
        { status: 409 }
      );
    }
    if (terkirim) {
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
      const { error: bukaError } = await supabaseAdmin
        .from('evaluasi_sesi')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', sesi_id);
      if (bukaError) {
        console.error('[nilai/reset] buka kunci gagal:', bukaError.message);
        return NextResponse.json({ error: 'Gagal membuka kunci sesi' }, { status: 500 });
      }
      void logAudit({
        actor: pengajar as never,
        action: 'evaluasi.sesi.buka_kunci',
        targetTable: 'evaluasi_sesi',
        targetId: sesi_id,
        detail: {
          halaqah_id: sesi.halaqah_id,
          jenis: sesi.jenis,
          nomor_sesi: sesi.nomor_sesi,
          lewat: 'reset',
        },
      });
    }

    let del = supabaseAdmin.from('evaluasi_nilai').delete().eq('sesi_id', sesi_id);
    if (typeof peserta_id === 'string') del = del.eq('peserta_id', peserta_id);
    const { error } = await del;
    if (error) {
      console.error('[nilai/reset] gagal:', error.message);
      return NextResponse.json({ error: 'Gagal mereset nilai' }, { status: 500 });
    }

    void logAudit({
      actor: pengajar as never,
      action: 'evaluasi.nilai.reset',
      targetTable: 'evaluasi_nilai',
      targetId: sesi_id,
      detail: {
        peserta_id: peserta_id ?? null,
        scope: peserta_id ? 'peserta' : 'sesi',
        dibuka_dulu: terkirim,
      },
    });

    return NextResponse.json({ ok: true, dibuka_dulu: terkirim });
  } catch (e: unknown) {
    console.error('[nilai/reset] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal mereset nilai' }, { status: 500 });
  }
}
