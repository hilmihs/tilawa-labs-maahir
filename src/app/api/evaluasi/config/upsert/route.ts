import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';

export const runtime = 'nodejs';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Kolom DB & check constraint-nya masih mengizinkan 1 atau 2; nilainya dipaksa 2
// di sini supaya tak ada gender yang kehilangan salah satu sesi ujian.
const UJIAN_ATTEMPTS_TETAP = 2;

function validDateArray(v: unknown): v is string[] {
  if (!Array.isArray(v)) return false;
  return v.every((x) => typeof x === 'string' && (x === '' || ISO_DATE_RE.test(x)));
}

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const koordinator = accesses.find((a) => a.role === 'koordinator') as
      | { role: 'koordinator'; koordinator_id: string; gender: string }
      | undefined;
    if (!koordinator) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const gender = koordinator.gender;
    if (!gender) {
      return NextResponse.json({ error: 'Gender koordinator tak diketahui' }, { status: 400 });
    }

    const body = await req.json();
    const { nama_qn, nama_pb, ujian_attempts, jadwal } = body as {
      nama_qn: string;
      nama_pb: string;
      ujian_attempts?: number;
      jadwal: { qn: unknown; pb: unknown; ujian: unknown };
    };

    if (typeof nama_qn !== 'string' || !nama_qn.trim() || nama_qn.length > 60) {
      return NextResponse.json({ error: 'nama_qn tidak valid' }, { status: 400 });
    }
    if (typeof nama_pb !== 'string' || !nama_pb.trim() || nama_pb.length > 60) {
      return NextResponse.json({ error: 'nama_pb tidak valid' }, { status: 400 });
    }
    // Tiap track wajib punya ujian akhirnya sendiri (nomor_sesi 1 = Ujian QN,
    // nomor_sesi 2 = Ujian PB), keduanya menyumbang 70% nilai akhir rapot track
    // masing-masing. Jumlah sesi ujian karena itu dibekukan di 2 — klien lama
    // yang masih mengirim 1 ditolak, bukan diam-diam diturunkan.
    if (ujian_attempts !== undefined && ujian_attempts !== UJIAN_ATTEMPTS_TETAP) {
      return NextResponse.json(
        { error: 'Ujian tetap 2: Ujian QN & Ujian PB' },
        { status: 400 }
      );
    }
    if (
      !jadwal ||
      typeof jadwal !== 'object' ||
      Array.isArray(jadwal) ||
      !validDateArray(jadwal.qn) ||
      !validDateArray(jadwal.pb) ||
      !validDateArray(jadwal.ujian)
    ) {
      return NextResponse.json({ error: 'jadwal tidak valid' }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from('eval_config').upsert(
      {
        gender,
        nama_qn,
        nama_pb,
        ujian_attempts: UJIAN_ATTEMPTS_TETAP,
        jadwal: { qn: jadwal.qn, pb: jadwal.pb, ujian: jadwal.ujian },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'gender' }
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
