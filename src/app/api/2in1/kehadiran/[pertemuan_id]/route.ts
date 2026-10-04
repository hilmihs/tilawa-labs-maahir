import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, isTakhassusKelas } from '@/lib/program-kelas';
import { getTakhassusVia, setorViaHalaqah } from '@/lib/takhassus-via-halaqah';
import { pesanTerkunci, presensiTerbuka } from '@/lib/periode-laporan';
import { butuhAlasan, isStatusValid, type StatusKehadiran } from '@/lib/kehadiran-status';

export const runtime = 'nodejs';

type Status = StatusKehadiran;

type PertemuanTerotorisasi = {
  id: string;
  program_kelas_id: string;
  program: string;
  tanggal: string;
  kelasName: string;
};

/**
 * Pastikan pemanggil adalah ketua/wakil kelas pemilik pertemuan ini.
 *
 * Dipakai GET maupun PUT: isi kehadiran memuat kolom `catatan` yang berisi
 * alasan tidak hadir (kadang keterangan kesehatan), jadi membacanya butuh izin
 * yang sama dengan menulisnya. Sebelum Agustus 2026 GET tanpa gerbang sama
 * sekali — siapa pun yang tahu satu pertemuan_id bisa membacanya.
 */
async function otorisasiPertemuan(
  pertemuanId: string
): Promise<{ pertemuan: PertemuanTerotorisasi } | { gagal: NextResponse }> {
  const wa = await getSessionWa();
  if (!wa) {
    return { gagal: NextResponse.json({ error: 'Login diperlukan.' }, { status: 401 }) };
  }
  const { data: pertemuan } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, program_kelas:program_kelas_id(name, ketua_wa, wakil_wa)')
    .eq('id', pertemuanId)
    .single();
  if (!pertemuan || !pertemuan.program_kelas_id) {
    return { gagal: NextResponse.json({ error: 'Pertemuan tidak ditemukan.' }, { status: 404 }) };
  }
  const pk = pertemuan.program_kelas as unknown as {
    name: string;
    ketua_wa: string | null;
    wakil_wa: string | null;
  };
  if (pk.ketua_wa !== wa && pk.wakil_wa !== wa) {
    return {
      gagal: NextResponse.json(
        { error: 'Hanya ketua/wakil kelas yang bisa mengakses kehadiran kelas ini.' },
        { status: 403 }
      ),
    };
  }
  return {
    pertemuan: {
      id: pertemuan.id as string,
      program_kelas_id: pertemuan.program_kelas_id as string,
      program: pertemuan.program as string,
      tanggal: pertemuan.tanggal as string,
      kelasName: pk.name,
    },
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  const auth = await otorisasiPertemuan(params.pertemuan_id);
  if ('gagal' in auth) return auth.gagal;

  const { data, error } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('anggota_id, status, catatan, setoran_halaman, mode, diisi_at')
    .eq('pertemuan_id', params.pertemuan_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kehadiran: data ?? [] });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { pertemuan_id: string } }
) {
  try {
    const auth = await otorisasiPertemuan(params.pertemuan_id);
    if ('gagal' in auth) return auth.gagal;
    const pertemuan = auth.pertemuan;

    // Periode yang sudah dilaporkan tak boleh berubah di belakang.
    const tanggal = pertemuan.tanggal;
    if (!presensiTerbuka(tanggal)) {
      return NextResponse.json({ error: pesanTerkunci(tanggal) }, { status: 403 });
    }

    const body = await req.json();
    const rows = body.rows as Array<{
      anggota_id: string;
      status: Status;
      catatan?: string;
      setoran_halaman?: number | string | null;
      mode?: string | null; // 'online' | 'offline'
    }>;
    // Materi pertemuan (per-pertemuan, seragam se-kelas). undefined = klien tak
    // mengirim (pertahankan nilai lama); '' → null.
    const materiRaw = body.materi as string | null | undefined;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows wajib diisi.' }, { status: 400 });
    }

    // Tidak hadir wajib beralasan — kolom Keterangan di rekap kehadiran dan
    // laporan bulanan mengandalkan catatan ini. Divalidasi di server juga,
    // bukan hanya di form, supaya tak bisa dilewati.
    const tanpaAlasan = rows.filter(
      (r) => butuhAlasan(r.status) && String(r.catatan ?? '').trim() === ''
    );
    if (tanpaAlasan.length > 0) {
      return NextResponse.json(
        { error: `Alasan wajib diisi untuk ${tanpaAlasan.length} peserta yang tidak hadir (izin/sakit/alpa).` },
        { status: 400 }
      );
    }

    // Map anggota → peserta_id (nullable) untuk kolom legacy
    const anggotaIds = rows.map((r) => r.anggota_id);
    const { data: anggotaList } = await supabaseAdmin
      .from('program_kelas_anggota')
      .select('id, peserta_id, program_kelas_id, whatsapp_number')
      .in('id', anggotaIds);
    const pesertaByAnggota = new Map((anggotaList ?? []).map((a) => [a.id, a.peserta_id]));

    // Setoran halaman hanya untuk sesi Kelas Maahir. Nilai lama dipertahankan
    // bila klien tak mengirim field-nya (mis. peserta sudah isi via presensi
    // mandiri, lalu ketua menyimpan ulang kehadiran).
    const isKelasMaahir = pertemuan.program === 'kelas_maahir';
    // Yang menyetor hanya peserta Takhassus: seluruh anggota kelas Takhassus,
    // atau peserta Takhassus yang dipresensi di kelas halaqah ini (via WA).
    // Setoran baris lain diabaikan — nilai lamanya dipertahankan.
    const via = await getTakhassusVia();
    const anggotaById = new Map((anggotaList ?? []).map((a) => [a.id as string, a]));
    const bolehSetor = (anggotaId: string): boolean => {
      if (isTakhassusKelas(pertemuan.kelasName)) return true;
      const a = anggotaById.get(anggotaId);
      return (
        !!a &&
        setorViaHalaqah(
          via,
          { program_kelas_id: a.program_kelas_id as string, whatsapp_number: a.whatsapp_number as string | null },
          pertemuan.tanggal
        )
      );
    };
    const { data: existingRows } = await supabaseAdmin
      .from('kehadiran_peserta')
      .select('anggota_id, setoran_halaman')
      .eq('pertemuan_id', params.pertemuan_id);
    const setoranLama = new Map(
      (existingRows ?? []).map((e) => [e.anggota_id as string, e.setoran_halaman as number | null])
    );
    const parseSetoran = (r: (typeof rows)[number]): number | null => {
      if (!isKelasMaahir) return null;
      if (r.setoran_halaman === undefined || !bolehSetor(r.anggota_id)) {
        return setoranLama.get(r.anggota_id) ?? null;
      }
      if (r.setoran_halaman === null || r.setoran_halaman === '') return null;
      const n = Number(r.setoran_halaman);
      return Number.isInteger(n) && n >= 0 ? n : (setoranLama.get(r.anggota_id) ?? null);
    };

    const now = new Date().toISOString();
    const upsertData = rows.map((r) => ({
      pertemuan_id: params.pertemuan_id,
      anggota_id: r.anggota_id,
      peserta_id: pesertaByAnggota.get(r.anggota_id) ?? null,
      status: isStatusValid(r.status) ? r.status : 'tidak_ada_keterangan',
      catatan: r.catatan || null,
      setoran_halaman: parseSetoran(r),
      // Hadir online/offline; default offline bila tak dikirim klien.
      mode: r.mode === 'online' ? 'online' : 'offline',
      diisi_at: now,
      updated_at: now,
    }));

    const { error } = await supabaseAdmin
      .from('kehadiran_peserta')
      .upsert(upsertData, { onConflict: 'pertemuan_id,anggota_id' });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Simpan materi pertemuan bila dikirim. Disimpan di pertemuan_program (bukan
    // per-peserta) karena satu materi berlaku untuk seluruh anggota kelas.
    if (materiRaw !== undefined) {
      const materiVal =
        typeof materiRaw === 'string' && materiRaw.trim() !== '' ? materiRaw.trim() : null;
      const { error: materiErr } = await supabaseAdmin
        .from('pertemuan_program')
        .update({ materi: materiVal })
        .eq('id', params.pertemuan_id);
      if (materiErr) return NextResponse.json({ error: materiErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
