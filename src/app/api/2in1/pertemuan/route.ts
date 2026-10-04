import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa } from '@/lib/program-kelas';
import { pesanTerkunci, presensiTerbuka } from '@/lib/periode-laporan';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const wa = await getSessionWa();
    if (!wa) {
      return NextResponse.json({ error: 'Login diperlukan.' }, { status: 401 });
    }

    const body = await req.json();
    const { program_kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai, keterangan } = body as {
      program_kelas_id: string;
      program: string;
      tanggal: string;
      nama_kegiatan: string;
      waktu_mulai?: string | null;
      waktu_selesai?: string | null;
      keterangan?: string | null;
    };

    const valid = ['kelas_maahir', 'at_tibyan', 'muallim_najih'];
    if (!valid.includes(program)) {
      return NextResponse.json({ error: 'Program tidak valid.' }, { status: 400 });
    }
    if (!program_kelas_id || !tanggal || !nama_kegiatan) {
      return NextResponse.json({ error: 'Kelas, tanggal, dan nama kegiatan wajib diisi.' }, { status: 400 });
    }

    // Verify caller is ketua/wakil of this program_kelas
    const { data: kelas } = await supabaseAdmin
      .from('program_kelas')
      .select('id, ketua_wa, wakil_wa, ikut_tibyan')
      .eq('id', program_kelas_id)
      .maybeSingle();
    if (!kelas || (kelas.ketua_wa !== wa && kelas.wakil_wa !== wa)) {
      return NextResponse.json({ error: 'Hanya ketua/wakil kelas yang bisa membuat pertemuan.' }, { status: 403 });
    }
    // Kelas ber-ikut_tibyan=false (halaqah per-hari akhwat) mencatat At-Tibyan
    // lewat kelas gabungan; membuatnya manual di sini menghidupkan lagi tagihan
    // ganda yang sengaja dihapus expectedDaysForKelas.
    if (program === 'at_tibyan' && kelas.ikut_tibyan === false) {
      return NextResponse.json(
        { error: 'Kelas ini tidak mencatat At-Tibyan; presensi At-Tibyan diisi lewat kelas At-Tibyan gabungan.' },
        { status: 400 }
      );
    }
    // Tak boleh membuat pertemuan di periode yang sudah ditutup — kalau boleh,
    // kunci pengisian kehadiran gampang ditembus lewat pintu ini.
    if (!presensiTerbuka(tanggal)) {
      return NextResponse.json({ error: pesanTerkunci(tanggal) }, { status: 403 });
    }

    const { data: inserted, error } = await supabaseAdmin
      .from('pertemuan_program')
      .upsert(
        {
          program_kelas_id,
          program,
          tanggal,
          nama_kegiatan,
          waktu_mulai: waktu_mulai || null,
          waktu_selesai: waktu_selesai || null,
          keterangan: keterangan || null,
        },
        { onConflict: 'program_kelas_id,program,tanggal', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: inserted.id });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
