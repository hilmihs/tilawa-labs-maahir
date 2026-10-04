import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPool } from '@/lib/pg-core';
import { getSession } from '@/lib/session';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { columnsToCounts, type Jenis, type Track } from '@/lib/evaluasi';
import {
  alasanBelumTerbit,
  buildTrackRapotPayload,
  type RapotIdentitas,
  type SesiNilaiInput,
} from '@/lib/rapot';

/**
 * Sejak rotasi 0062 penerbitan HANYA melayani rapot per-track. Nama field di body
 * tetap `jenis_rapot` (kembar dgn kolom DB), tapi nilainya kini sebuah Track.
 */
const TRACKS: Track[] = ['qn', 'pb'];
/** Jenis era lama — dokumennya masih sah & terverifikasi, tapi tak bisa diterbitkan lagi. */
const JENIS_LEGACY = ['berkala', 'ujian', 'ujian_qn', 'ujian_pb'];
const TRACK_LABEL: Record<Track, string> = { qn: 'QN', pb: 'PB' };

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const s = await getSession();
    const accesses = s.accesses ?? (s.session ? [s.session] : []);
    const pengajar = accesses.find((a) => a.role === 'pengajar') as
      | { role: 'pengajar'; pengajar_id: string; name: string }
      | undefined;
    if (!pengajar) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      halaqah_id?: unknown;
      peserta_id?: unknown;
      jenis_rapot?: unknown;
    };
    const halaqah_id = body.halaqah_id;
    const peserta_id = body.peserta_id;
    const jenis_rapot = body.jenis_rapot;

    if (typeof halaqah_id !== 'string' || !halaqah_id) {
      return NextResponse.json({ error: 'halaqah_id wajib diisi' }, { status: 400 });
    }
    if (typeof peserta_id !== 'string' || !peserta_id) {
      return NextResponse.json({ error: 'peserta_id wajib diisi' }, { status: 400 });
    }
    if (typeof jenis_rapot === 'string' && JENIS_LEGACY.includes(jenis_rapot)) {
      return NextResponse.json(
        { error: 'Jenis rapot lama tidak bisa diterbitkan lagi — gunakan Rapot QN / Rapot PB' },
        { status: 400 }
      );
    }
    if (typeof jenis_rapot !== 'string' || !TRACKS.includes(jenis_rapot as Track)) {
      return NextResponse.json({ error: 'jenis_rapot tidak valid' }, { status: 400 });
    }
    const track = jenis_rapot as Track;
    const trackLabel = TRACK_LABEL[track];

    // --- Halaqah + verifikasi kepemilikan pengajar ---
    const { data: halaqah } = await supabaseAdmin
      .from('eval_halaqah')
      .select('id, pengajar_id, nama, gender, mustawa, level, batch_id, ambang_ujian')
      .eq('id', halaqah_id)
      .maybeSingle();
    if (!halaqah) {
      return NextResponse.json({ error: 'Halaqah tidak ditemukan' }, { status: 404 });
    }
    const evalPengajarId = await evalPengajarIdFor(pengajar.pengajar_id);
    if (!evalPengajarId || halaqah.pengajar_id !== evalPengajarId) {
      return NextResponse.json({ error: 'Bukan halaqah Anda' }, { status: 403 });
    }

    // --- Peserta ---
    const { data: peserta } = await supabaseAdmin
      .from('eval_peserta')
      .select('id, nama, halaqah_id')
      .eq('id', peserta_id)
      .maybeSingle();
    if (!peserta) {
      return NextResponse.json({ error: 'Peserta tidak ditemukan' }, { status: 404 });
    }
    // Peserta wajib milik halaqah ini — cegah snapshot lintas-halaqah.
    if (peserta.halaqah_id !== halaqah_id) {
      return NextResponse.json({ error: 'Peserta bukan anggota halaqah ini' }, { status: 403 });
    }

    // --- Batch (opsional) + skema rapot ujian batch tsb (0058) ---
    let batchNama: string | null = null;
    let terpisah = false;
    if (halaqah.batch_id) {
      const { data: batch } = await supabaseAdmin
        .from('eval_batch')
        .select('nama, rapot_ujian_terpisah')
        .eq('id', halaqah.batch_id)
        .maybeSingle();
      batchNama = (batch?.nama as string | undefined) ?? null;
      terpisah = !!batch?.rapot_ujian_terpisah;
    }

    // Batch `rapot_ujian_terpisah` (0058): nilai akhir murni skor ujian, komponen
    // berkala tidak dipakai — dan sejak 0062 itu berlaku untuk KEDUA track, bukan
    // PB saja. Jadi flag batch langsung jadi `ujianSaja`, tanpa cabang per jenis.
    const ujianSaja = terpisah;

    // --- Config by gender (nama_qn, nama_pb) ---
    const { data: config } = await supabaseAdmin
      .from('eval_config')
      .select('nama_qn, nama_pb')
      .eq('gender', halaqah.gender)
      .maybeSingle();
    const namaQn = (config?.nama_qn as string | undefined) ?? undefined;
    const namaPb = (config?.nama_pb as string | undefined) ?? undefined;

    // --- Semua sesi halaqah (tidak dihapus) ---
    const { data: sesiRows } = await supabaseAdmin
      .from('evaluasi_sesi')
      .select('id, jenis, nomor_sesi, tgl_jadwal')
      .eq('halaqah_id', halaqah_id)
      .not('dihapus', 'is', true);

    const sesiList = sesiRows ?? [];
    const sesiIds = sesiList.map((r) => r.id as string);

    // --- Nilai peserta ini untuk sesi di atas ---
    const nilaiBySesi = new Map<string, Record<string, unknown>>();
    if (sesiIds.length > 0) {
      const { data: nilaiRows } = await supabaseAdmin
        .from('evaluasi_nilai')
        .select('*')
        .eq('peserta_id', peserta_id)
        .in('sesi_id', sesiIds);
      for (const n of nilaiRows ?? []) {
        nilaiBySesi.set(n.sesi_id as string, n as Record<string, unknown>);
      }
    }

    // --- Susun SesiNilaiInput[] ---
    const sesi: SesiNilaiInput[] = sesiList.map((row) => {
      const nilaiRow = nilaiBySesi.get(row.id as string);
      return {
        jenis: row.jenis as Jenis,
        nomor_sesi: row.nomor_sesi as number,
        counts: columnsToCounts(nilaiRow ?? {}),
        catatan: (nilaiRow?.catatan as string | undefined) ?? '',
        tgl: (row.tgl_jadwal as string | null) ?? null,
        done: !!nilaiRow?.done,
        hadir: nilaiRow ? (nilaiRow.hadir as boolean | undefined) !== false : true,
      };
    });

    // --- Identitas & meta terbit ---
    const identitas: RapotIdentitas = {
      peserta: peserta.nama as string,
      halaqah: halaqah.nama as string,
      level: (halaqah.level as string | null) ?? null,
      mustawa: (halaqah.mustawa as number | null) ?? null,
      gender: halaqah.gender as string,
      batch: batchNama,
    };
    const penerbit = pengajar.name;
    const tanggal = new Date().toISOString();

    // --- Build payload ---
    const payload = buildTrackRapotPayload({
      track,
      identitas,
      penerbit,
      tanggal,
      sesi,
      namaTrack: track === 'qn' ? namaQn : namaPb,
      ambangUjianSesi: halaqah.ambang_ujian as number,
      ujianSaja,
    });

    // --- Guard kelengkapan (server-side, jangan andalkan client) ---
    // Dihitung SETELAH payload dibangun, dari fungsi yang sama dengan yang
    // mengunci tombol di layar pengajar (`alasanBelumTerbit`). Membangun payload
    // tak punya efek samping, jadi urutan ini aman — dan mahar itu menutup
    // kemungkinan aturan klien & server berbeda diam-diam.
    const alasan = alasanBelumTerbit(payload.trackRapot);
    if (alasan.length > 0) {
      return NextResponse.json(
        { error: `${alasan.join(' · ')} — Rapot ${trackLabel} belum bisa diterbitkan` },
        { status: 400 }
      );
    }

    // --- Kolom ringkas untuk query cepat ---
    const t = payload.trackRapot;
    const nilai_akhir = t.nilaiAkhir;
    const berkala_avg = t.berkalaAvg;
    const ujian_skor = t.ujianSkor;
    // `ujian_pb_skor` = kolom LEGACY; baris qn wajib null (lihat komentar 0062).
    const ujian_pb_skor = track === 'pb' ? t.ujianSkor : null;
    const lulus = t.lulus;

    const token = crypto.randomBytes(16).toString('hex');

    // --- Terbitkan ulang = supersede, ATOMIK dalam 1 transaksi ---
    // demote rapot aktif lama → insert baru (aktif) → tautkan superseded_by.
    // Dijalankan via client pg langsung (shim tak punya tx) supaya dua terbit
    // paralel ter-serialisasi oleh row-lock, bukan bergantung index sbg jaring.
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      const demoted = await client.query(
        `update evaluasi_rapot set status = 'digantikan'
           where peserta_id = $1 and halaqah_id = $2 and jenis_rapot = $3 and status = 'aktif'
         returning id`,
        [peserta_id, halaqah_id, track]
      );
      const oldId = (demoted.rows[0]?.id as string | undefined) ?? null;

      const ins = await client.query(
        `insert into evaluasi_rapot
           (token, halaqah_id, peserta_id, jenis_rapot, nilai_akhir, berkala_avg,
            ujian_skor, ujian_pb_skor, lulus, ambang, payload, diterbitkan_oleh)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
         returning id`,
        [
          token, halaqah_id, peserta_id, track, nilai_akhir, berkala_avg,
          ujian_skor, ujian_pb_skor, lulus, payload.ambang, JSON.stringify(payload), evalPengajarId,
        ]
      );
      const newId = ins.rows[0].id as string;

      if (oldId) {
        await client.query(`update evaluasi_rapot set superseded_by = $1 where id = $2`, [newId, oldId]);
      }
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[terbitkan] tx gagal:', txErr instanceof Error ? txErr.message : txErr);
      return NextResponse.json({ error: 'Gagal menerbitkan rapot' }, { status: 500 });
    } finally {
      client.release();
    }

    return NextResponse.json({ ok: true, token });
  } catch (e: unknown) {
    console.error('[terbitkan] error:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Gagal menerbitkan rapot' }, { status: 500 });
  }
}
