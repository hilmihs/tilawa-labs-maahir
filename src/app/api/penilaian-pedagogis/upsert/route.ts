import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { getKelompokDinilaiIds } from '@/lib/penilai-ketua';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Tiga penilai:
    //  - Ketua kelompok         → menilai ANGGOTA kelompoknya.
    //  - Penilai yang ditugaskan → menilai KETUA kelompok yang jadi jatahnya
    //    (tabel penilai_ketua_kelompok).
    //  - Koordinator            → menilai KETUA KELOMPOK segendernya.
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string; kelompok_id: string | null; is_ketua: boolean; gender: string }
      | undefined;
    const koordinator = accesses.find((a) => a.role === 'koordinator') as
      | { role: 'koordinator'; koordinator_id: string; gender: string }
      | undefined;
    if (!pengajar && !koordinator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      pengajar_id,
      year_month,
      skor_metode_pengajaran,
      keterangan_metode,
      skor_kepatuhan_silabus,
      keterangan_silabus,
      skor_manajemen_halaqah,
      keterangan_halaqah,
      skor_evaluasi_penguasaan,
      keterangan_evaluasi,
      catatan_umum,
    } = body as {
      pengajar_id: string;
      year_month: string;
      skor_metode_pengajaran: number | null;
      keterangan_metode: string | null;
      skor_kepatuhan_silabus: number | null;
      keterangan_silabus: string | null;
      skor_manajemen_halaqah: number | null;
      keterangan_halaqah: string | null;
      skor_evaluasi_penguasaan: number | null;
      keterangan_evaluasi: string | null;
      catatan_umum: string | null;
    };

    if (!pengajar_id || !year_month) {
      return NextResponse.json({ error: 'pengajar_id dan year_month wajib diisi' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(year_month)) {
      return NextResponse.json({ error: 'Format year_month harus YYYY-MM' }, { status: 400 });
    }
    if (typeof catatan_umum === 'string' && catatan_umum.length > 2000) {
      return NextResponse.json({ error: 'Catatan umum maksimal 2000 karakter.' }, { status: 400 });
    }

    const { data: target } = await supabaseAdmin
      .from('pengajar')
      .select('id, kelompok_id, is_ketua, gender')
      .eq('id', pengajar_id)
      .single();
    if (!target) {
      return NextResponse.json({ error: 'Pengajar tidak ditemukan.' }, { status: 404 });
    }

    // Otorisasi + atribusi (assessed_by). Jalur pengajar dicoba dulu supaya
    // seseorang yang merangkap koordinator tetap bisa menilai kelompoknya.
    let assessedBy: string | null;
    const bolehSebagaiKetua =
      !!pengajar && pengajar.is_ketua && target.kelompok_id === pengajar.kelompok_id;
    const bolehSebagaiPenilaiKetua =
      !!pengajar &&
      !!target.is_ketua &&
      !!target.kelompok_id &&
      (await getKelompokDinilaiIds(pengajar.pengajar_id)).includes(target.kelompok_id);

    if (bolehSebagaiKetua || bolehSebagaiPenilaiKetua) {
      assessedBy = pengajar!.pengajar_id;
    } else if (koordinator) {
      // Koordinator hanya boleh menilai KETUA KELOMPOK segendernya.
      if (!target.is_ketua || target.gender !== koordinator.gender) {
        return NextResponse.json(
          { error: 'Koordinator hanya menilai ketua kelompok segender.' },
          { status: 403 }
        );
      }
      assessedBy = null; // penilai koordinator (bukan pengajar) → atribusi kosong
    } else {
      return NextResponse.json(
        { error: 'Pengajar ini bukan anggota kelompok Anda dan bukan jatah penilaian Anda.' },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from('penilaian_pedagogis')
      .upsert(
        {
          pengajar_id,
          year_month,
          skor_metode_pengajaran: skor_metode_pengajaran ?? null,
          keterangan_metode: keterangan_metode ?? null,
          skor_kepatuhan_silabus: skor_kepatuhan_silabus ?? null,
          keterangan_silabus: keterangan_silabus ?? null,
          skor_manajemen_halaqah: skor_manajemen_halaqah ?? null,
          keterangan_halaqah: keterangan_halaqah ?? null,
          skor_evaluasi_penguasaan: skor_evaluasi_penguasaan ?? null,
          keterangan_evaluasi: keterangan_evaluasi ?? null,
          // skor_kepatuhan_sop/keterangan_sop TIDAK ditulis dari sini —
          // diisi otomatis oleh sistem observasi ketua kelas HITS.
          catatan_umum: catatan_umum ?? null,
          assessed_by: assessedBy,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'pengajar_id,year_month' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
