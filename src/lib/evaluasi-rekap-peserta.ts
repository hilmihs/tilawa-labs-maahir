// Rekap peserta lintas-halaqah untuk koordinator: satu baris per peserta,
// berisi nilai akhir rapot per track (QN & PB), bisa diurutkan.
//
// Dashboard (`evaluasi-dashboard.ts`) menjawab "halaqah mana yang tertinggal";
// modul ini menjawab "peserta mana yang tertinggal" — pertanyaan yang sebelumnya
// hanya bisa dijawab dengan membuka 116 halaman detail satu per satu.
//
// Angka yang dipakai sengaja nilai akhir RAPOT (`nilaiAkhirTrackOf`), bukan
// rata-rata sesi: itu satu-satunya angka yang juga dicetak di lembar rapot, dan
// dua angka berbeda untuk "nilai peserta" akan langsung jadi sumber sengketa.
// Karena itu penyaring `cakupan` milik dashboard TIDAK berlaku di sini — nilai
// akhir punya rumusnya sendiri yang tak bergantung pilihan sesi.
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  AMBANG_LULUS_AKHIR, UJIAN_QN_SESI, UJIAN_PB_SESI, nilaiAkhirTrackOf,
} from '@/lib/evaluasi';
import type { NilaiAkhirTrack } from '@/lib/evaluasi';
import {
  susunOpsiProgram, susunOpsiBatch, batchTerpakai, idBatchLolos, labelGender,
  pilihNamaTrack,
} from '@/lib/evaluasi-dashboard';
import type { BarisBatch, GenderFilter, OpsiPilih } from '@/lib/evaluasi-dashboard';
import { bolehDiputuskan } from '@/lib/evaluasi-keputusan';
import { muatKeputusan } from '@/lib/evaluasi-keputusan-db';
import type { Keputusan } from '@/lib/evaluasi-keputusan';
import type { Gender } from '@/types/db';

/** Kolom yang bisa dijadikan kunci urut. */
export const URUT = ['qn', 'pb', 'nama', 'halaqah'] as const;
export type Urut = (typeof URUT)[number];
export const URUT_DEFAULT: Urut = 'qn';

export const ARAH = ['naik', 'turun'] as const;
export type Arah = (typeof ARAH)[number];
export const ARAH_DEFAULT: Arah = 'naik';

export interface FilterPeserta {
  program: string;
  batch: string;
  gender: GenderFilter;
  urut: Urut;
  arah: Arah;
  /** Sisakan hanya peserta yang tidak lulus PB — yang perlu diputuskan. */
  hanyaMengulang: boolean;
}

export interface BarisPeserta {
  id: string;
  nama: string;
  halaqahId: string;
  halaqahNama: string;
  /** "Ikhwan · HITS Reguler Juni 2026 · Lanjutan" */
  sub: string;
  gender: Gender;
  pengajar: string;
  qn: NilaiAkhirTrack;
  pb: NilaiAkhirTrack;
  /**
   * Peserta ini boleh diberi keputusan mengulang — nilai akhir PB sah dan di
   * bawah ambang. QN rendah TIDAK membuatnya true: QN prasyarat, bukan penentu.
   */
  bisaDiputuskan: boolean;
  /** Kelas tempat koordinator memutuskan peserta mengulang; null = belum. */
  keputusan: Keputusan | null;
}

export interface TotalPeserta {
  peserta: number;
  /** Peserta yang nilai akhirnya sudah sah di minimal satu track. */
  bernilai: number;
  rataQn: number | null;
  rataPb: number | null;
  /**
   * Peserta yang nilai akhir PB-nya sah dan di bawah AMBANG_LULUS_AKHIR.
   *
   * HANYA PB. Rapot QN adalah prasyarat yang nilainya tidak menggugurkan
   * kelulusan level — ikut menghitungnya di sini akan menyebut "mengulang"
   * peserta yang secara resmi lulus, dan angka itu dipakai koordinator untuk
   * memutuskan pengulangan orang.
   */
  mengulang: number;
  /** Dari `mengulang`, yang belum diberi keputusan kelas pengulangan. */
  belumDiputuskan: number;
}

export interface HasilRekapPeserta {
  rows: BarisPeserta[];
  opsiProgram: OpsiPilih[];
  opsiBatch: OpsiPilih[];
  programTerpilih: string;
  batchTerpilih: string;
  ringkasFilter: string;
  total: TotalPeserta;
  namaTrackQn: string;
  namaTrackPb: string;
  /** false = mirror memang kosong; true tapi rows kosong = penyaringnya. */
  adaPesertaSamaSekali: boolean;
}

// ── Fungsi murni (diuji di scripts/test-evaluasi-rekap-peserta.ts) ──

export function bacaFilterPeserta(
  // Sama seperti `bacaFilter`: Next memberi `string | string[]`.
  sp: {
    program?: string | string[]; batch?: string | string[];
    gender?: string | string[]; urut?: string | string[]; arah?: string | string[];
    mengulang?: string | string[];
  },
  genderPemakai: Gender
): FilterPeserta {
  const satu = (v: string | string[] | undefined): string =>
    (Array.isArray(v) ? v[0] : v) ?? '';
  const g = satu(sp.gender);
  const u = satu(sp.urut);
  const a = satu(sp.arah);
  return {
    program: satu(sp.program),
    batch: satu(sp.batch),
    gender: g === 'ikhwan' || g === 'akhwat' || g === 'semua' ? g : genderPemakai,
    urut: (URUT as readonly string[]).includes(u) ? (u as Urut) : URUT_DEFAULT,
    arah: (ARAH as readonly string[]).includes(a) ? (a as Arah) : ARAH_DEFAULT,
    hanyaMengulang: satu(sp.mengulang) === '1',
  };
}

/**
 * Urutkan baris peserta.
 *
 * Peserta tanpa nilai akhir SELALU di bawah, baik urut naik maupun turun —
 * bukan diperlakukan sebagai nol. Daftar ini dibaca untuk mencari "siapa yang
 * nilainya paling rendah"; kalau 591 peserta yang belum dinilai menumpuk di
 * puncak, jawaban yang dicari justru terdorong keluar layar. Ketiadaan nilai
 * tetap kelihatan — kolomnya bertanda "—" dan ada kartu hitungannya.
 */
export function urutkanPeserta(rows: BarisPeserta[], urut: Urut, arah: Arah): BarisPeserta[] {
  const arahNum = arah === 'turun' ? -1 : 1;
  const byNama = (a: BarisPeserta, b: BarisPeserta) => a.nama.localeCompare(b.nama, 'id');
  const byNilai = (a: number | null, b: number | null): number | null => {
    if (a == null && b == null) return null; // seri → jatuh ke tie-break nama
    if (a == null) return 1;   // tanpa nilai selalu ke bawah
    if (b == null) return -1;
    return (a - b) * arahNum;
  };

  return [...rows].sort((a, b) => {
    if (urut === 'nama') return byNama(a, b) * arahNum;
    if (urut === 'halaqah') {
      const h = a.halaqahNama.localeCompare(b.halaqahNama, 'id') * arahNum;
      return h !== 0 ? h : byNama(a, b);
    }
    const n = urut === 'pb'
      ? byNilai(a.pb.nilai, b.pb.nilai)
      : byNilai(a.qn.nilai, b.qn.nilai);
    return n != null && n !== 0 ? n : byNama(a, b);
  });
}

// ── Pemuat ──

const NO_ID = ['00000000-0000-0000-0000-000000000000'];

interface SesiMeta {
  jenis: string;
  nomor_sesi: number;
}

/** Kumpulan skor mentah satu peserta, sebelum diringkas jadi nilai akhir. */
interface KomponenPeserta {
  berkalaQn: number[];
  berkalaPb: number[];
  ujianQn: number | null;
  ujianPb: number | null;
}

export async function muatRekapPeserta(f: FilterPeserta): Promise<HasilRekapPeserta> {
  const { data: batchRaw } = await supabaseAdmin
    .from('eval_batch')
    .select('id, nama, family, batch_label, batch_order, rapot_ujian_terpisah');
  const batchRows = (batchRaw ?? []) as Array<BarisBatch & { rapot_ujian_terpisah: boolean | null }>;
  const batches: BarisBatch[] = batchRows;

  const opsiProgram = susunOpsiProgram(batches);
  const batchTerpilih = batchTerpakai(batches, f.program, f.batch);
  const opsiBatch = susunOpsiBatch(batches, f.program);
  const idsLolos = idBatchLolos(batches, f.program, f.batch);
  const batchById = new Map(batchRows.map((b) => [b.id, b]));
  const namaFamily = new Map(opsiProgram.map((o) => [o.value, o.label]));
  const programTerpilih = namaFamily.has(f.program) ? f.program : '';
  const ringkasFilter = [
    programTerpilih ? namaFamily.get(programTerpilih) : 'Semua program',
    batchTerpilih ? batchById.get(batchTerpilih)?.batch_label ?? null : null,
    labelGender(f.gender),
  ]
    .filter(Boolean)
    .join(' · ');

  let qHalaqah = supabaseAdmin
    .from('eval_halaqah')
    .select('id, nama, gender, mustawa, level, pengajar_id, batch_id');
  if (f.gender !== 'semua') qHalaqah = qHalaqah.eq('gender', f.gender);
  if (idsLolos) qHalaqah = qHalaqah.in('batch_id', idsLolos.length ? idsLolos : NO_ID);
  const { data: halaqahRaw } = await qHalaqah;
  const halaqahList = (halaqahRaw ?? []) as Array<{
    id: string; nama: string; gender: Gender; mustawa: number | null;
    level: string | null; pengajar_id: string | null; batch_id: string | null;
  }>;
  const halaqahIds = halaqahList.map((h) => h.id);

  const { data: configRaw } = await supabaseAdmin
    .from('eval_config')
    .select('gender, nama_qn, nama_pb');
  const configs = (configRaw ?? []) as Array<{ gender: string; nama_qn: string; nama_pb?: string }>;
  const namaTrackQn = pilihNamaTrack(configs, f.gender);
  const namaTrackPb = pilihNamaTrack(configs, f.gender, 'nama_pb');

  const pengajarIds = Array.from(
    new Set(halaqahList.map((h) => h.pengajar_id).filter((x): x is string => !!x))
  );
  const { data: pengajarRaw } = await supabaseAdmin
    .from('eval_pengajar')
    .select('id, nama')
    .in('id', pengajarIds.length ? pengajarIds : NO_ID);
  const pengajarName = new Map(
    (pengajarRaw ?? []).map((p) => [p.id as string, p.nama as string])
  );

  const { data: pesertaRaw } = await supabaseAdmin
    .from('eval_peserta')
    .select('id, nama, halaqah_id')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID)
    .eq('aktif', true);
  const pesertaList = (pesertaRaw ?? []) as Array<{ id: string; nama: string; halaqah_id: string }>;

  // Membedakan "mirror memang kosong" dari "penyaringnya terlalu sempit".
  let adaPesertaSamaSekali = pesertaList.length > 0;
  if (!adaPesertaSamaSekali) {
    const { data: adaRaw } = await supabaseAdmin.from('eval_peserta').select('id').limit(1);
    adaPesertaSamaSekali = (adaRaw ?? []).length > 0;
  }

  const { data: sesiRaw } = await supabaseAdmin
    .from('evaluasi_sesi')
    .select('id, halaqah_id, jenis, nomor_sesi, dihapus')
    .in('halaqah_id', halaqahIds.length ? halaqahIds : NO_ID);
  const sesiHidup = ((sesiRaw ?? []) as Array<{
    id: string; halaqah_id: string; jenis: string; nomor_sesi: number; dihapus: boolean;
  }>).filter((s) => !s.dihapus);
  const sesiMeta = new Map<string, SesiMeta>(
    sesiHidup.map((s) => [s.id, { jenis: s.jenis, nomor_sesi: s.nomor_sesi }])
  );
  const sesiIds = sesiHidup.map((s) => s.id);

  const { data: nilaiRaw } = await supabaseAdmin
    .from('evaluasi_nilai')
    .select('sesi_id, peserta_id, skor, done, hadir')
    .in('sesi_id', sesiIds.length ? sesiIds : NO_ID);
  const nilaiRows = (nilaiRaw ?? []) as Array<{
    sesi_id: string; peserta_id: string; skor: number; done: boolean; hadir: boolean;
  }>;

  const komponen = new Map<string, KomponenPeserta>();
  for (const n of nilaiRows) {
    // Selaras dengan rapot resmi dan halaman detail: hanya sesi done & hadir.
    if (!n.done || n.hadir === false) continue;
    const m = sesiMeta.get(n.sesi_id);
    if (!m) continue;
    let k = komponen.get(n.peserta_id);
    if (!k) {
      k = { berkalaQn: [], berkalaPb: [], ujianQn: null, ujianPb: null };
      komponen.set(n.peserta_id, k);
    }
    const skor = Number(n.skor) || 0;
    if (m.jenis === 'qn') k.berkalaQn.push(skor);
    else if (m.jenis === 'pb') k.berkalaPb.push(skor);
    else if (m.jenis === 'ujian' && m.nomor_sesi === UJIAN_QN_SESI) k.ujianQn = skor;
    else if (m.jenis === 'ujian' && m.nomor_sesi === UJIAN_PB_SESI) k.ujianPb = skor;
  }

  const keputusanByPeserta = await muatKeputusan(pesertaList.map((p) => p.id));

  const halaqahById = new Map(halaqahList.map((h) => [h.id, h]));
  const KOSONG: KomponenPeserta = { berkalaQn: [], berkalaPb: [], ujianQn: null, ujianPb: null };

  const rowsMentah: BarisPeserta[] = [];
  for (const p of pesertaList) {
    const h = halaqahById.get(p.halaqah_id);
    if (!h) continue; // peserta yatim — halaqahnya tak lolos penyaring/terhapus
    const b = h.batch_id ? batchById.get(h.batch_id) ?? null : null;
    // `rapot_ujian_terpisah` berlaku untuk KEDUA track, sama seperti halaman detail.
    const terpisah = !!b?.rapot_ujian_terpisah;
    const k = komponen.get(p.id) ?? KOSONG;

    const programNama = (b?.family && namaFamily.get(b.family)) || 'Tanpa program';
    const genderLabel = h.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat';
    const levelText = h.level ?? (h.mustawa != null ? `Mustawa ${h.mustawa}` : null);
    const asal = b ? (b.batch_label ? `${programNama} ${b.batch_label}` : programNama) : null;

    const qn = nilaiAkhirTrackOf('qn', k.berkalaQn, k.ujianQn, { ujianSaja: terpisah });
    const pb = nilaiAkhirTrackOf('pb', k.berkalaPb, k.ujianPb, { ujianSaja: terpisah });

    rowsMentah.push({
      id: p.id,
      nama: p.nama,
      halaqahId: h.id,
      halaqahNama: h.nama,
      sub: [genderLabel, asal, levelText].filter(Boolean).join(' · '),
      gender: h.gender,
      pengajar: (h.pengajar_id && pengajarName.get(h.pengajar_id)) || '—',
      qn,
      pb,
      bisaDiputuskan: bolehDiputuskan({ nilaiPb: pb.nilai }),
      // Keputusan basi ikut ditampilkan bila nilainya sempat berubah jadi lulus:
      // menyembunyikannya diam-diam membuat baris di DB tak bisa dilihat siapa
      // pun, padahal koordinator perlu tahu ada yang harus dibatalkan.
      keputusan: keputusanByPeserta.get(p.id) ?? null,
    });
  }

  const rows = urutkanPeserta(rowsMentah, f.urut, f.arah);

  let bernilai = 0;
  let mengulang = 0;
  let belumDiputuskan = 0;
  let qnSum = 0;
  let qnN = 0;
  let pbSum = 0;
  let pbN = 0;
  for (const r of rows) {
    const adaQn = r.qn.nilai != null;
    const adaPb = r.pb.nilai != null;
    if (adaQn || adaPb) bernilai += 1;
    // Sengaja `bisaDiputuskan`, bukan pemeriksaan sendiri: satu definisi
    // "tidak lulus" untuk kartu, daftar, dan server action.
    if (r.bisaDiputuskan) {
      mengulang += 1;
      if (r.keputusan == null) belumDiputuskan += 1;
    }
    if (adaQn) { qnSum += r.qn.nilai as number; qnN += 1; }
    if (adaPb) { pbSum += r.pb.nilai as number; pbN += 1; }
  }

  // Kartu ringkasan dihitung dari SELURUH baris yang lolos penyaring utama,
  // bukan dari yang tersisa setelah "hanya yang mengulang". Kalau ikut menyusut,
  // menyalakan saringan itu membuat "Mengulang 40 dari 950" berubah jadi
  // "Mengulang 40 dari 40" — angka yang benar tapi tak lagi menjawab apa pun.
  const rowsTampil = f.hanyaMengulang ? rows.filter((r) => r.bisaDiputuskan) : rows;

  return {
    rows: rowsTampil,
    opsiProgram,
    opsiBatch,
    programTerpilih,
    batchTerpilih,
    ringkasFilter,
    total: {
      peserta: rows.length,
      bernilai,
      rataQn: qnN > 0 ? Math.round(qnSum / qnN) : null,
      rataPb: pbN > 0 ? Math.round(pbSum / pbN) : null,
      mengulang,
      belumDiputuskan,
    },
    namaTrackQn,
    namaTrackPb,
    adaPesertaSamaSekali,
  };
}

/** Ambang lulus dipakai halaman untuk mewarnai angka; diekspor ulang di sini
 *  supaya halaman tak perlu mengimpor dua modul untuk satu tabel. */
export { AMBANG_LULUS_AKHIR };
