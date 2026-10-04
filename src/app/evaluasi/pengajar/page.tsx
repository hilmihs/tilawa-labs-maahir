import { cookies } from 'next/headers';
import { requirePengajar } from '@/lib/session';
import { HALAQAH_COOKIE } from '@/lib/evaluasi-cookie';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { evalPengajarIdFor } from '@/lib/evaluasi-pengajar';
import { AMBANG_UJIAN_DEFAULT, columnsToCounts, JENIS, type Jenis, type Track } from '@/lib/evaluasi';
import {
  EvaluasiPengajarApp,
  type EvaluasiInitial,
  type EvWork,
  type RapotTerbit,
} from './EvaluasiPengajarApp';

export const dynamic = 'force-dynamic';

interface SesiRow {
  id: string;
  jenis: string;
  nomor_sesi: number;
  tgl_jadwal: string | null;
  surat: string;
  ayat_mulai: number;
  ayat_selesai: number;
  ambang: number;
  status: string;
  dihapus: boolean;
}

// Sumbu rapot = track. Tiap track punya ujian akhirnya sendiri dan keduanya
// wajib ada: nomor_sesi 1 = Ujian QN, nomor_sesi 2 = Ujian PB (masing-masing
// menyumbang 70% nilai akhir rapot track-nya). Jadi jumlah sesi ujian dibekukan
// di 2 — TIDAK lagi mengikuti eval_config.ujian_attempts.
const UJIAN_SESSIONS = 2;

function maxSessionsFor(jenis: Jenis): number {
  return jenis === 'ujian' ? UJIAN_SESSIONS : 4;
}

function currentSessionFor(jenis: Jenis, sesiList: SesiRow[], maxSessions: number): number {
  const js = sesiList.filter((s) => s.jenis === jenis && !s.dihapus);
  const drafts = js.filter((s) => s.status === 'draft');
  if (drafts.length) return Math.max(...drafts.map((s) => s.nomor_sesi));
  const sent = js.filter((s) => s.status === 'terkirim');
  if (sent.length) return Math.min(Math.max(...sent.map((s) => s.nomor_sesi)) + 1, maxSessions);
  return 1;
}

export default async function EvaluasiPengajarPage({
  searchParams,
}: {
  searchParams: { halaqah?: string };
}) {
  const session = await requirePengajar();

  // Mirror hilmihs mengidentifikasi pengajar lewat `wa:<nomor>`, bukan id maahir.
  const evalPengajarId = await evalPengajarIdFor(session.pengajar_id);

  // SEMUA halaqah pengajar (bisa >1 lintas program). Tanpa WA cocok → tak ada.
  const { data: halaqahRows } = evalPengajarId
    ? await supabaseAdmin
        .from('eval_halaqah')
        .select('id, nama, gender, mustawa, level, ambang_ujian, batch_id')
        .eq('pengajar_id', evalPengajarId)
        .order('nama')
    : { data: null };

  const allHalaqah = halaqahRows ?? [];
  // Halaqah aktif: ?halaqah=<id> → halaqah terakhir yang dipilih (cookie) →
  // yang pertama. Tanpa cookie, pengajar ber-halaqah >1 selalu mendarat di
  // halaqah pertama menurut abjad, dan isian di halaqah lainnya tampak
  // "hilang". Cookie divalidasi: hanya dipakai bila halaqahnya masih milik
  // pengajar ini.
  let halaqahCookie: string | undefined;
  try {
    const mentah = cookies().get(HALAQAH_COOKIE)?.value;
    halaqahCookie = mentah ? decodeURIComponent(mentah) : undefined;
  } catch {
    halaqahCookie = undefined;
  }
  const halaqah =
    allHalaqah.find((h) => h.id === searchParams.halaqah) ??
    allHalaqah.find((h) => h.id === halaqahCookie) ??
    allHalaqah[0] ??
    null;
  const halaqahOptions = allHalaqah.map((h) => ({ id: h.id as string, nama: h.nama as string }));

  if (!halaqah) {
    return (
      <main style={{ minHeight: '100vh', background: '#f4f2ed' }}>
        <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>📖</div>
          <h1 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 6px', color: '#1b1a17' }}>Belum ada halaqah</h1>
          <p style={{ fontSize: 13, color: '#7a766f', lineHeight: 1.5, margin: 0 }}>
            Halaqah binaan Anda belum tersinkron ke sistem evaluasi. Hubungi koordinator bila ini keliru.
          </p>
        </div>
      </main>
    );
  }

  // Peserta aktif, urut.
  const { data: pesertaRows } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama, is_ketua, urutan')
    .eq('halaqah_id', halaqah.id)
    .eq('aktif', true)
    .order('urutan', { ascending: true });

  const peserta = (pesertaRows ?? []).map((p) => ({
    id: p.id as string,
    nama: p.nama as string,
    is_ketua: !!p.is_ketua,
    urutan: (p.urutan as number) ?? 0,
  }));

  // Sesi halaqah.
  const { data: sesiRowsRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, jenis, nomor_sesi, tgl_jadwal, surat, ayat_mulai, ayat_selesai, ambang, status, dihapus')
    .eq('halaqah_id', halaqah.id);
  const sesiRows = (sesiRowsRaw ?? []) as SesiRow[];

  // Nilai untuk sesi tsb.
  const sesiIds = sesiRows.map((s) => s.id);
  const noId = ['00000000-0000-0000-0000-000000000000'];
  const { data: nilaiRows } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select(
      'sesi_id, peserta_id, hadir, ayat_terakhir, catatan, confirmed, done, updated_at, ' +
        'jk_huruf, jk_harakat, jk_mad, jk_tasydid, kh_izhar, kh_idgham_bighunnah, kh_idgham_bilaghunnah, kh_idgham_mimi, kh_iqlab, kh_ikhfa_hakiki, kh_ikhfa_syafawi'
    )
    .in('sesi_id', sesiIds.length ? sesiIds : noId);

  // Batch: menentukan skema rapot ujian (0058). Batch HITS Januari menilai ujian
  // QN & PB terpisah, nilai akhir murni skor ujian tanpa bobot evaluasi berkala.
  let rapotUjianTerpisah = false;
  let batchNama: string | null = null;
  if (halaqah.batch_id) {
    const { data: batchRow } = await supabaseAdmin
      .from('eval_batch')
      .select('nama, rapot_ujian_terpisah')
      .eq('id', halaqah.batch_id as string)
      .maybeSingle();
    rapotUjianTerpisah = !!batchRow?.rapot_ujian_terpisah;
    batchNama = (batchRow?.nama as string | undefined) ?? null;
  }

  // Rapot yang SUDAH terbit untuk halaqah ini.
  //
  // Wajib dimuat di sini: token rapot dulu hanya muncul sekali, di panel setelah
  // penerbitan berhasil. `window.open` yang menyusul diblokir peramban HP, dan
  // panel itu musnah begitu pengajar pindah layar — rapot yang sudah masuk DB
  // jadi tak bisa dibuka lagi, dan satu-satunya jalan adalah menerbitkan ulang,
  // yang mencabut lembar yang sudah dibagikan. Dengan daftar ini, token selalu
  // bisa ditemukan kembali di Pusat Rapot.
  const { data: rapotRows } = await supabaseAdmin
    .from('evaluasi_rapot')
    .select('token, peserta_id, jenis_rapot, nilai_akhir, lulus, diterbitkan_at')
    .eq('halaqah_id', halaqah.id)
    .eq('status', 'aktif');

  const rapotTerbit: RapotTerbit[] = (rapotRows ?? [])
    // Baris era lama ('berkala', 'ujian', …) tak punya padanan dokumen yang bisa
    // diterbitkan lagi, jadi tak ditampilkan sebagai status track.
    .filter((r) => r.jenis_rapot === 'qn' || r.jenis_rapot === 'pb')
    .map((r) => ({
      token: r.token as string,
      peserta_id: r.peserta_id as string,
      track: r.jenis_rapot as Track,
      nilai_akhir: (r.nilai_akhir as number | null) ?? null,
      lulus: (r.lulus as boolean | null) ?? null,
      diterbitkan_at: (r.diterbitkan_at as string | null) ?? null,
    }));

  // Config per gender.
  const { data: configRow } = await supabaseAdmin
    .from('eval_config')
    .select('nama_qn, nama_pb, jadwal')
    .eq('gender', halaqah.gender)
    .maybeSingle();

  const jadwalRaw = (configRow?.jadwal ?? {}) as Record<string, unknown>;
  const asDates = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  const config = {
    nama_qn: (configRow?.nama_qn as string) ?? 'Evaluasi QN',
    nama_pb: (configRow?.nama_pb as string) ?? 'Evaluasi PB',
    // Dibekukan di 2 (Ujian QN + Ujian PB); kolom DB tak lagi jadi acuan supaya
    // baris lama yang bernilai 1 tidak menyembunyikan Ujian PB di UI pengajar.
    ujian_attempts: UJIAN_SESSIONS,
    jadwal: {
      qn: asDates(jadwalRaw.qn),
      pb: asDates(jadwalRaw.pb),
      ujian: asDates(jadwalRaw.ujian),
    },
  };

  // Reconstruct work state keyed "<pesertaId>|<jenis>|<nomor_sesi>".
  const sesiById = new Map(sesiRows.map((s) => [s.id, s]));
  const work: Record<string, EvWork> = {};
  // Versi tiap baris (updated_at) — dikirim balik saat menyimpan supaya server
  // bisa menolak penulisan dari data basi (tab lama / perangkat lain).
  const versi: Record<string, string> = {};
  for (const n of nilaiRows ?? []) {
    const sesi = sesiById.get(n.sesi_id as string);
    if (!sesi) continue;
    const key = `${n.peserta_id}|${sesi.jenis}|${sesi.nomor_sesi}`;
    work[key] = {
      counts: columnsToCounts(n as Record<string, unknown>),
      catatan: (n.catatan as string | null) ?? '',
      ayat: (n.ayat_terakhir as number | null) ?? sesi.ayat_mulai,
      done: !!n.done,
      confirmed: !!n.confirmed,
      hadir: n.hadir !== false,
    };
    if (n.updated_at) versi[key] = String(n.updated_at);
  }

  const currentSession = {} as Record<Jenis, number>;
  for (const j of JENIS) {
    currentSession[j] = currentSessionFor(j, sesiRows, maxSessionsFor(j));
  }

  const initial: EvaluasiInitial = {
    pengajarName: session.name,
    halaqahOptions,
    halaqah: {
      id: halaqah.id as string,
      nama: halaqah.nama as string,
      gender: halaqah.gender,
      mustawa: (halaqah.mustawa as number | null) ?? null,
      level: (halaqah.level as string | null) ?? null,
      ambang_ujian: (halaqah.ambang_ujian as number) ?? AMBANG_UJIAN_DEFAULT,
      pesertaCount: peserta.length,
      batch: batchNama,
      rapotUjianTerpisah,
    },
    config,
    peserta,
    sesiList: sesiRows.map((s) => ({
      id: s.id,
      jenis: s.jenis as Jenis,
      nomor_sesi: s.nomor_sesi,
      tgl_jadwal: s.tgl_jadwal,
      surat: s.surat,
      ayat_mulai: s.ayat_mulai,
      ayat_selesai: s.ayat_selesai,
      ambang: s.ambang,
      status: s.status as 'draft' | 'terkirim',
      dihapus: !!s.dihapus,
    })),
    work,
    versi,
    currentSession,
    rapotTerbit,
  };

  return <EvaluasiPengajarApp initial={initial} />;
}
