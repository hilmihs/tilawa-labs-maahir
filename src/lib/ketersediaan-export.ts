import 'server-only';
import ExcelJS from 'exceljs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPeriode, KsPrioritasPreset, KsSlot } from '@/types/db';
import { listSlot } from '@/lib/ketersediaan-periode';
import { peringkatDari, urutanDariWaktuIsi, urutanUntuk, type Urutan } from '@/lib/ketersediaan-prioritas';

/**
 * Ekspor xlsx yang meniru Template_Ketersediaan_Mengajar_HITS.xlsx.
 *
 * Susunan sheet dan kolomnya sengaja dipertahankan persis supaya proses hilir
 * (tim program, tim campaign) tidak perlu diubah sama sekali. Bedanya: isinya
 * angka jadi, bukan formula. Di template lama sel biru berisi rumus yang rusak
 * bila diketik ulang; di sini tidak ada rumus yang bisa dirusak.
 *
 * Tiga kolom skor (Kompetensi/Kedisiplinan/Komitmen) dipertahankan sebagai
 * kolom, tetapi dibiarkan kosong: urutan prioritas kini berasal dari ranking
 * Matrix Skill Guru atau preset urutan manual, bukan dari tiga angka yang
 * diketik satu per satu. Hal ini diterangkan di sheet PETUNJUK agar pembaca
 * berkas tidak menyangka datanya hilang.
 */

const KOP = { bold: true } as const;

interface BarisKerja {
  timestamp: string;
  periode: string;
  nama: string;
  wa: string;
  kelompok: Gender;
  mode: string;
  lokasi: string;
  waktu: string;
  status: string;
  prioritas: number | '';
  catatan: string;
  slotId: string;
  slotMode: string;
}

const STATUS_TAMPIL: Record<string, string> = {
  diajukan: 'Terverifikasi',
  terverifikasi: 'Terverifikasi',
  perlu_konfirmasi: 'Perlu konfirmasi',
  ditolak: 'Ditolak',
};

export async function bangunWorkbook(
  periode: KsPeriode,
  opts?: { presetIkhwan?: KsPrioritasPreset | null; presetAkhwat?: KsPrioritasPreset | null }
): Promise<ExcelJS.Workbook> {
  const slots = await listSlot(periode.id);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const { data: pengisianRows } = await supabaseAdmin
    .from('ks_pengisian')
    .select(
      'id, pengajar_id, mode, lokasi, submitted_at, status, alasan_kurang_slot, catatan_koordinator, pengajar:pengajar_id(name, gender, whatsapp_number)'
    )
    .eq('periode_id', periode.id);

  const pengisian = (pengisianRows ?? []) as {
    id: string;
    pengajar_id: string;
    mode: string;
    lokasi: string | null;
    submitted_at: string | null;
    status: string;
    alasan_kurang_slot: string | null;
    catatan_koordinator: string | null;
    pengajar?: { name: string; gender: Gender; whatsapp_number: string } | null;
  }[];

  const { data: ketRows } = await supabaseAdmin
    .from('ks_ketersediaan')
    .select('pengisian_id, slot_id, status, catatan');
  const pengisianIds = new Set(pengisian.map((p) => p.id));
  const ketersediaan = ((ketRows ?? []) as {
    pengisian_id: string;
    slot_id: string;
    status: string;
    catatan: string | null;
  }[]).filter((k) => pengisianIds.has(k.pengisian_id));

  const urutan: Record<Gender, Urutan> = {
    ikhwan: opts?.presetIkhwan
      ? await urutanUntuk(opts.presetIkhwan)
      : await urutanDariWaktuIsi(periode.id, 'ikhwan'),
    akhwat: opts?.presetAkhwat
      ? await urutanUntuk(opts.presetAkhwat)
      : await urutanDariWaktuIsi(periode.id, 'akhwat'),
  };

  const pengisianById = new Map(pengisian.map((p) => [p.id, p]));

  // Satu baris per pengajar × slot, persis bentuk sheet KERJA.
  const kerja: BarisKerja[] = [];
  for (const k of ketersediaan) {
    const p = pengisianById.get(k.pengisian_id);
    const s = slotById.get(k.slot_id);
    if (!p || !s || !p.pengajar) continue;
    kerja.push({
      timestamp: p.submitted_at ? p.submitted_at.replace('T', ' ').slice(0, 19) : '',
      periode: periode.nama,
      nama: p.pengajar.name,
      wa: p.pengajar.whatsapp_number,
      kelompok: p.pengajar.gender,
      mode: p.mode === 'keduanya' ? 'Online/Offline' : p.mode === 'offline' ? 'Offline' : 'Online',
      lokasi: p.lokasi ?? '',
      waktu: s.label,
      status: STATUS_TAMPIL[k.status] ?? k.status,
      prioritas: '',
      catatan: k.catatan ?? p.catatan_koordinator ?? p.alasan_kurang_slot ?? '',
      slotId: s.id,
      slotMode: s.mode,
    });
  }

  // Prioritas dihitung per kombinasi kelompok + mode + slot — aturan yang sama
  // dengan dokumen konsep, hanya sumber urutannya yang berubah.
  const perGrup = new Map<string, BarisKerja[]>();
  for (const b of kerja) {
    if (b.status !== 'Terverifikasi') continue;
    const g = `${b.kelompok}|${b.slotMode}|${b.slotId}`;
    if (!perGrup.has(g)) perGrup.set(g, []);
    perGrup.get(g)!.push(b);
  }
  const pengajarIdByNama = new Map(pengisian.map((p) => [p.pengajar?.name ?? '', p.pengajar_id]));
  for (const baris of perGrup.values()) {
    baris
      .sort((a, b) => {
        const pa = peringkatDari(urutan[a.kelompok], pengajarIdByNama.get(a.nama) ?? '');
        const pb = peringkatDari(urutan[b.kelompok], pengajarIdByNama.get(b.nama) ?? '');
        if (pa !== pb) return pa - pb;
        // Pemutus seri dokumen konsep: pengisi form lebih awal didahulukan.
        return a.timestamp.localeCompare(b.timestamp);
      })
      .forEach((b, i) => {
        b.prioritas = i + 1;
      });
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Maahir — Ketersediaan Mengajar HITS';
  wb.created = new Date(periode.updated_at);

  tulisPetunjuk(wb, periode, urutan);
  tulisMasterSlot(wb, slots);
  tulisKerja(wb, kerja);
  tulisOutput(wb, 'IKHWAN', kerja.filter((b) => b.kelompok === 'ikhwan'));
  tulisOutput(wb, 'AKHWAT', kerja.filter((b) => b.kelompok === 'akhwat'));
  tulisOffline(wb, kerja.filter((b) => b.slotMode === 'offline'));
  await tulisRekapSlot(wb, periode, slots, ketersediaan, pengisianById);
  await tulisLog(wb, periode);

  return wb;
}

function kop(ws: ExcelJS.Worksheet, kolom: string[]): void {
  const baris = ws.addRow(kolom);
  baris.font = KOP;
  ws.columns.forEach((c, i) => {
    c.width = Math.max(12, Math.min(38, (kolom[i]?.length ?? 10) + 6));
  });
}

function tulisPetunjuk(wb: ExcelJS.Workbook, p: KsPeriode, urutan: Record<Gender, Urutan>): void {
  const ws = wb.addWorksheet('PETUNJUK');
  ws.columns = [{ width: 34 }, { width: 70 }];
  ws.addRow(['KETERSEDIAAN MENGAJAR — PROGRAM HITS']).font = { bold: true, size: 14 };
  ws.addRow(['Periode', p.nama]);
  ws.addRow(['Masa berlaku', `${p.mulai} s.d. ${p.selesai}`]);
  ws.addRow([
    'Bentuk kerja',
    p.form_tutup
      ? 'Bergelombang — form ditutup pada tanggal tertentu'
      : 'Bergulir — form ketersediaan selalu terbuka, halaqah dibentuk saat murid cukup dan pengajar tersedia',
  ]);
  ws.addRow([]);
  ws.addRow(['ATURAN YANG BERLAKU']).font = KOP;
  ws.addRow(['Kapasitas per halaqah', p.kapasitas_halaqah]);
  ws.addRow(['Ambang bentuk halaqah', p.ambang_bentuk]);
  ws.addRow(['Ambang bawah (antrean tua)', p.ambang_bawah]);
  ws.addRow(['Batas usia antrean (hari)', p.usia_antrean_maks_hari]);
  ws.addRow(['Jeda mulai setelah konfirmasi (hari)', p.jeda_mulai_hari]);
  ws.addRow(['Tenggat konfirmasi pengajar (jam)', p.tenggat_konfirmasi_jam]);
  ws.addRow(['Penyegaran ketersediaan (hari)', p.penyegaran_hari]);
  ws.addRow([]);
  ws.addRow(['SUMBER URUTAN PRIORITAS']).font = KOP;
  ws.addRow(['Ikhwan', urutan.ikhwan.keterangan]);
  ws.addRow(['Akhwat', urutan.akhwat.keterangan]);
  ws.addRow([]);
  ws.addRow(['CATATAN PEMBACAAN']).font = KOP;
  ws.addRow([
    '',
    'Kolom Skor Kompetensi / Kedisiplinan / Komitmen di sheet KERJA sengaja dikosongkan. '
      + 'Urutan prioritas tidak lagi berasal dari tiga angka yang diketik manual, melainkan dari '
      + 'ranking Matrix Skill Guru atau preset urutan manual yang tercatat di sistem.',
  ]);
  ws.addRow([
    '',
    'Seluruh angka pada berkas ini sudah jadi, bukan formula. Tidak ada sel yang rusak bila diketik ulang, '
      + 'tetapi berkas ini juga tidak memperbarui dirinya — unduh ulang untuk data terbaru.',
  ]);
  ws.addRow([
    '',
    'Prioritas dihitung per kombinasi kelompok + mode + slot waktu. Hanya baris berstatus '
      + 'Terverifikasi yang mendapat nomor.',
  ]);
  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

function tulisMasterSlot(wb: ExcelJS.Workbook, slots: readonly KsSlot[]): void {
  const ws = wb.addWorksheet('MASTER_SLOT');
  kop(ws, ['No', 'Kelompok', 'Mode', 'Slot Waktu', 'Lokasi (offline)', 'Status']);
  slots.forEach((s, i) => {
    ws.addRow([
      i + 1,
      s.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
      s.mode === 'offline' ? 'Offline' : 'Online',
      s.label,
      s.lokasi ?? '',
      s.aktif ? 'Aktif' : 'Nonaktif',
    ]);
  });
}

function tulisKerja(wb: ExcelJS.Workbook, kerja: readonly BarisKerja[]): void {
  const ws = wb.addWorksheet('KERJA');
  kop(ws, [
    'Timestamp',
    'Periode / Batch',
    'Nama',
    'WA',
    'Kelompok',
    'Mode',
    'Lokasi',
    'Waktu',
    'Skor Kompetensi (1-5)',
    'Skor Kedisiplinan (1-5)',
    'Skor Komitmen (1-5)',
    'Skor Total',
    'Status Verifikasi',
    'Prioritas',
    'Catatan',
  ]);
  for (const b of kerja) {
    ws.addRow([
      b.timestamp,
      b.periode,
      b.nama,
      b.wa,
      b.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
      b.mode,
      b.lokasi,
      b.waktu,
      '',
      '',
      '',
      '',
      b.status,
      b.prioritas,
      b.catatan,
    ]);
  }
}

/** Sheet IKHWAN / AKHWAT — 5 kolom, sama persis dengan Jadwal KBM HITS Juni 2026. */
function tulisOutput(wb: ExcelJS.Workbook, nama: string, baris: readonly BarisKerja[]): void {
  const ws = wb.addWorksheet(nama);
  kop(ws, ['Nama', 'WA', 'Online/Offline', 'Waktu', 'Prioritas']);
  for (const b of baris) {
    if (b.status !== 'Terverifikasi') continue;
    ws.addRow([b.nama, b.wa, b.slotMode === 'offline' ? 'Offline' : 'Online', b.waktu, b.prioritas]);
  }
}

/** Sheet OFFLINE — 6 kolom, ada tambahan Ikhwan/Akhwat. */
function tulisOffline(wb: ExcelJS.Workbook, baris: readonly BarisKerja[]): void {
  const ws = wb.addWorksheet('OFFLINE');
  kop(ws, ['Nama', 'WA', 'Ikhwan/Akhwat', 'Online/Offline', 'Waktu', 'Prioritas']);
  for (const b of baris) {
    if (b.status !== 'Terverifikasi') continue;
    ws.addRow([
      b.nama,
      b.wa,
      b.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
      'Offline',
      b.waktu,
      b.prioritas,
    ]);
  }
}

async function tulisRekapSlot(
  wb: ExcelJS.Workbook,
  periode: KsPeriode,
  slots: readonly KsSlot[],
  ketersediaan: readonly { pengisian_id: string; slot_id: string; status: string }[],
  pengisianById: Map<string, { pengajar_id: string }>
): Promise<void> {
  const ws = wb.addWorksheet('REKAP_SLOT');
  kop(ws, [
    'No',
    'Kelompok',
    'Mode',
    'Slot Waktu',
    'Pengajar Terverifikasi',
    'Perlu Konfirmasi',
    'Total Pengisi',
  ]);

  const terverifikasi = new Map<string, Set<string>>();
  const perluKonfirmasi = new Map<string, Set<string>>();
  const total = new Map<string, Set<string>>();
  for (const k of ketersediaan) {
    const p = pengisianById.get(k.pengisian_id);
    if (!p) continue;
    const tambah = (m: Map<string, Set<string>>) => {
      if (!m.has(k.slot_id)) m.set(k.slot_id, new Set());
      m.get(k.slot_id)!.add(p.pengajar_id);
    };
    tambah(total);
    if (k.status === 'terverifikasi' || k.status === 'diajukan') tambah(terverifikasi);
    if (k.status === 'perlu_konfirmasi') tambah(perluKonfirmasi);
  }

  slots.forEach((s, i) => {
    ws.addRow([
      i + 1,
      s.kelompok === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
      s.mode === 'offline' ? 'Offline' : 'Online',
      s.label,
      terverifikasi.get(s.id)?.size ?? 0,
      perluKonfirmasi.get(s.id)?.size ?? 0,
      total.get(s.id)?.size ?? 0,
    ]);
  });
  void periode;
}

async function tulisLog(wb: ExcelJS.Workbook, periode: KsPeriode): Promise<void> {
  const ws = wb.addWorksheet('LOG_PERUBAHAN');
  kop(ws, ['Waktu', 'Entitas', 'Aksi', 'Alasan', 'Aktor', 'Sebelum', 'Sesudah']);

  const { data } = await supabaseAdmin
    .from('ks_log')
    .select('created_at, entitas, aksi, alasan, aktor_nama, aktor_wa, sebelum, sesudah')
    .eq('periode_id', periode.id)
    .order('created_at', { ascending: false })
    .limit(1000);

  for (const r of (data ?? []) as {
    created_at: string;
    entitas: string;
    aksi: string;
    alasan: string | null;
    aktor_nama: string | null;
    aktor_wa: string | null;
    sebelum: unknown;
    sesudah: unknown;
  }[]) {
    ws.addRow([
      r.created_at.replace('T', ' ').slice(0, 19),
      r.entitas,
      r.aksi,
      r.alasan ?? '',
      r.aktor_nama ?? r.aktor_wa ?? '',
      r.sebelum ? JSON.stringify(r.sebelum) : '',
      r.sesudah ? JSON.stringify(r.sesudah) : '',
    ]);
  }
}

export function namaBerkas(periode: KsPeriode): string {
  const bersih = periode.nama.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `Ketersediaan_Mengajar_HITS_${bersih || 'periode'}.xlsx`;
}
