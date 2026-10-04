import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { scoreOf, countsToColumns, type LahnCounts } from '@/lib/evaluasi';
import { simpanNilaiBerversi } from '@/lib/evaluasi-nilai-simpan';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pesan untuk sesi yang sudah dikirim. Dulu cuma "Sesi sudah dikirim" dan
// layar pengajar tak menampilkannya sama sekali — suntingan tampak tersimpan
// lalu "hilang" saat halaman dimuat ulang.
const PESAN_TERKIRIM =
  'Sesi ini sudah dikirim ke koordinator — nilainya tidak bisa diubah lagi. ' +
  'Buka kunci sesi dulu (tombol "Buka kunci") bila memang perlu diperbaiki.';

/** Jumlah lahn wajar untuk kolom smallint; buang NaN/negatif/pecahan. */
function rapikanCounts(counts: LahnCounts): LahnCounts {
  const out: LahnCounts = {};
  for (const [k, v] of Object.entries(counts)) {
    const n = Math.floor(Number(v));
    out[k] = Number.isFinite(n) ? Math.min(Math.max(0, n), 999) : 0;
  }
  return out;
}

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

    const body = (await req.json()) as Record<string, unknown>;
    const { sesi_id, peserta_id, hadir, ayat_terakhir, counts: countsMentah, catatan, confirmed, done } =
      body as {
        sesi_id: string;
        peserta_id: string;
        hadir?: boolean;
        ayat_terakhir?: number | null;
        counts: LahnCounts;
        catatan?: string | null;
        confirmed?: boolean;
        done?: boolean;
      };
    // Penjaga versi (opsional, supaya tab lama yang belum dimuat ulang tetap
    // jalan): bila klien menyertakan `expected_updated_at` — string versi yang
    // ia kenal, atau null = "baris belum ada" — penulisan hanya terjadi bila
    // server masih di versi itu. Tanpa kolom ini: perilaku lama (timpa).
    const pakaiVersi = Object.prototype.hasOwnProperty.call(body, 'expected_updated_at');
    const expected = body.expected_updated_at;
    if (
      pakaiVersi &&
      expected !== null &&
      (typeof expected !== 'string' || Number.isNaN(Date.parse(expected)))
    ) {
      return NextResponse.json({ error: 'expected_updated_at tidak valid' }, { status: 400 });
    }

    if (typeof sesi_id !== 'string' || !UUID_RE.test(sesi_id)) {
      return NextResponse.json({ error: 'sesi_id tidak valid' }, { status: 400 });
    }
    if (typeof peserta_id !== 'string' || !peserta_id) {
      return NextResponse.json({ error: 'peserta_id wajib diisi' }, { status: 400 });
    }
    if (!countsMentah || typeof countsMentah !== 'object' || Array.isArray(countsMentah)) {
      return NextResponse.json({ error: 'counts harus objek' }, { status: 400 });
    }
    const counts = rapikanCounts(countsMentah);

    const { data: sesi } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, halaqah_id, status')
      .eq('id', sesi_id)
      .maybeSingle();
    if (!sesi) {
      return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 });
    }
    if (sesi.status === 'terkirim') {
      return NextResponse.json({ error: PESAN_TERKIRIM, terkirim: true }, { status: 409 });
    }

    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id')
      .eq('id', sesi.halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // Skor selalu dihitung di server dari counts — jangan percaya skor dari klien.
    const skor = scoreOf(counts).skor;
    const cols = countsToColumns(counts);

    if (pakaiVersi) {
      const hasil = await simpanNilaiBerversi(
        {
          sesi_id,
          peserta_id,
          hadir: hadir ?? true,
          ayat_terakhir: ayat_terakhir ?? null,
          cols,
          skor,
          catatan: catatan ?? null,
          confirmed: !!confirmed,
          done: !!done,
        },
        (expected as string | null) ?? null
      );
      if (hasil.ok) {
        return NextResponse.json({ ok: true, skor, updated_at: hasil.updated_at });
      }
      if (hasil.alasan === 'terkirim') {
        return NextResponse.json({ error: PESAN_TERKIRIM, terkirim: true }, { status: 409 });
      }
      return NextResponse.json(
        {
          error: 'Nilai peserta ini sudah diubah di perangkat lain.',
          conflict: true,
          current: hasil.current,
        },
        { status: 409 }
      );
    }

    const { error } = await supabaseAdmin.from('evaluasi_nilai').upsert(
      {
        sesi_id,
        peserta_id,
        hadir: hadir ?? true,
        ayat_terakhir: ayat_terakhir ?? null,
        ...cols,
        skor,
        catatan: catatan ?? null,
        confirmed: !!confirmed,
        done: !!done,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'sesi_id,peserta_id' }
    );

    if (error) {
      console.error('[nilai/upsert] gagal:', error.message);
      return NextResponse.json({ error: 'Gagal menyimpan nilai' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, skor });
  } catch (e: unknown) {
    console.error('[nilai/upsert] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal menyimpan nilai' }, { status: 500 });
  }
}
