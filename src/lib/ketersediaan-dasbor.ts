import type { Gender, KsHariIdx, KsMode, KsSlot } from '@/types/db';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';
import type { KsPeriode, KsPitaUmur } from '@/types/db';
import { kelompokkanPendaftar, type PendaftarAlokasi } from '@/lib/ketersediaan-alokasi';

/**
 * Hitungan dashboard koordinator ketersediaan — murni, tanpa basis data.
 * Komponen hanya menampilkan; semua angka lahir di sini supaya bisa diuji.
 */

export type StatusJam = 'tanpa_pengajar' | 'kurang' | 'cukup' | 'kosong';

export interface BarisJam {
  slot_id: string;
  kelompok: Gender;
  mode: KsMode;
  lokasi: string | null;
  label: string;
  /** "Senin & Rabu" */
  hari: string;
  hariIdx: KsHariIdx[];
  /** "20:00" */
  jam: string;
  antre: number;
  pengajar: number;
  /** Yang bisa ditampung pengajar bebas di jam ini, tidak lebih dari yang mengantre. */
  tampung: number;
  sisa: number;
  butuh: number;
  bisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
  status: StatusJam;
}

export function susunBarisJam(
  slots: readonly KsSlot[],
  ringkas: ReadonlyMap<string, RingkasSlot>,
  kapasitas: number
): BarisJam[] {
  return slots
    .map((s): BarisJam => {
      const r = ringkas.get(s.id);
      const antre = r?.antre ?? 0;
      const pengajar = r?.pengajar_tersedia ?? 0;
      const bebas = Math.max(0, pengajar - (r?.pengajar_terpakai ?? 0));
      const tampung = Math.min(antre, bebas * kapasitas);
      const sisa = antre - tampung;
      const butuh = Math.ceil(antre / kapasitas);
      const status: StatusJam =
        antre === 0 ? 'kosong' : pengajar === 0 ? 'tanpa_pengajar' : sisa > 0 ? 'kurang' : 'cukup';
      return {
        slot_id: s.id,
        kelompok: s.kelompok,
        mode: s.mode,
        lokasi: s.lokasi,
        label: s.label,
        hari: s.hari.join(' & '),
        hariIdx: s.hari_idx,
        jam: s.waktu_mulai.slice(0, 5),
        antre,
        pengajar,
        tampung,
        sisa,
        butuh,
        bisa: Math.min(butuh, bebas),
        dialokasikan: r?.dialokasikan ?? 0,
        tertahan: r?.ditahan ?? 0,
        terpakaiLain: r?.terpakai_lain ?? 0,
        status,
      };
    })
    .sort((a, b) => b.sisa - a.sisa || b.antre - a.antre || a.label.localeCompare(b.label));
}

/**
 * Ganti daya tampung perkiraan dengan hasil simulasi alokasi.
 *
 * `susunBarisJam` memperkirakan tampung = pengajar bebas × kapasitas per jam.
 * Itu melebih-lebihkan: pengajar yang menyanggupi lima jam terhitung lima kali,
 * dan kelompok level/umur yang belum genap diperlakukan seolah sudah jadi
 * halaqah. Simulasi (`susunGabungan`) menjalankan mesin alokasi yang sama tanpa
 * menulis, jadi angkanya yang dipakai — baik untuk satu periode maupun gabungan.
 */
export function terapkanSimulasi(
  baris: readonly BarisJam[],
  tampungSim: ReadonlyMap<string, number>,
  kapasitas: number
): BarisJam[] {
  return baris
    .map((b): BarisJam => {
      const tampung = Math.min(b.antre, tampungSim.get(b.slot_id) ?? 0);
      const sisa = Math.max(0, b.antre - tampung);
      return {
        ...b,
        tampung,
        sisa,
        bisa: Math.floor(tampung / Math.max(1, kapasitas)),
        status: b.antre === 0 ? 'kosong' : b.pengajar === 0 ? 'tanpa_pengajar' : sisa > 0 ? 'kurang' : 'cukup',
      };
    })
    .sort((a, b) => b.sisa - a.sisa || b.antre - a.antre || a.label.localeCompare(b.label));
}

export interface AngkaJam {
  antre: number;
  tampung: number;
  sisa: number;
  dialokasikan: number;
  tertahan: number;
  terpakaiLain: number;
}

export function jumlahkan(baris: readonly BarisJam[]): AngkaJam {
  const out: AngkaJam = { antre: 0, tampung: 0, sisa: 0, dialokasikan: 0, tertahan: 0, terpakaiLain: 0 };
  for (const b of baris) {
    out.antre += b.antre;
    out.tampung += b.tampung;
    out.sisa += b.sisa;
    out.dialokasikan += b.dialokasikan;
    out.tertahan += b.tertahan;
    out.terpakaiLain += b.terpakaiLain;
  }
  return out;
}

export interface SelPeta {
  antre: number;
  sisa: number;
  pengajar: number;
  sisaOnline: number;
  sisaOffline: number;
  /** Berapa jam master yang jatuh di sel ini (online + offline di lokasi mana pun). */
  jumlahJam: number;
}

export interface Peta {
  hari: { kunci: string; label: string }[];
  jam: string[];
  sel: Record<string, SelPeta>;
}

export function kunciSel(kunciHari: string, jam: string): string {
  return `${kunciHari}|${jam}`;
}

/** Heatmap pasangan hari × jam mulai. Online dan offline dijumlah; tooltip memecahnya. */
export function susunPeta(baris: readonly BarisJam[]): Peta {
  const sel: Record<string, SelPeta> = {};
  const hari = new Map<string, { kunci: string; label: string; idx: readonly number[] }>();
  const jam = new Set<string>();

  for (const b of baris) {
    const kh = b.hariIdx.join(',');
    if (!hari.has(kh)) hari.set(kh, { kunci: kh, label: b.hari, idx: b.hariIdx });
    jam.add(b.jam);
    const k = kunciSel(kh, b.jam);
    const s = (sel[k] ??= { antre: 0, sisa: 0, pengajar: 0, sisaOnline: 0, sisaOffline: 0, jumlahJam: 0 });
    s.antre += b.antre;
    s.sisa += b.sisa;
    s.pengajar += b.pengajar;
    s.jumlahJam += 1;
    if (b.mode === 'online') s.sisaOnline += b.sisa;
    else s.sisaOffline += b.sisa;
  }

  const urutHari = [...hari.values()].sort((a, b) => {
    for (let i = 0; i < Math.max(a.idx.length, b.idx.length); i++) {
      const beda = (a.idx[i] ?? 9) - (b.idx[i] ?? 9);
      if (beda !== 0) return beda;
    }
    return 0;
  });

  return { hari: urutHari.map(({ kunci, label }) => ({ kunci, label })), jam: [...jam].sort(), sel };
}

/** Enam tingkat warna: 0, 1–24, 25–49, 50–99, 100–199, 200+. */
export function tingkatPeta(sisa: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (sisa <= 0) return 0;
  if (sisa < 25) return 1;
  if (sisa < 50) return 2;
  if (sisa < 100) return 3;
  if (sisa < 200) return 4;
  return 5;
}

export interface TitikArus {
  tanggal: string;
  ikhwan: number;
  akhwat: number;
}

const HARI_MS = 86_400_000;

function tanggalWib(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Pendaftar kumulatif per hari (WIB), tanpa lubang tanggal. */
export function susunArus(pendaftar: readonly { didaftar_pada: string | null; gender: Gender | null }[]): TitikArus[] {
  const harian = new Map<string, { ikhwan: number; akhwat: number }>();
  for (const p of pendaftar) {
    if (!p.didaftar_pada || !p.gender) continue;
    const t = tanggalWib(p.didaftar_pada);
    const h = harian.get(t) ?? { ikhwan: 0, akhwat: 0 };
    h[p.gender] += 1;
    harian.set(t, h);
  }
  const tanggal = [...harian.keys()].sort();
  if (tanggal.length === 0) return [];

  const out: TitikArus[] = [];
  let ikhwan = 0;
  let akhwat = 0;
  const akhir = tanggal[tanggal.length - 1];
  for (let d = new Date(`${tanggal[0]}T00:00:00Z`); d.toISOString().slice(0, 10) <= akhir; d = new Date(d.getTime() + HARI_MS)) {
    const t = d.toISOString().slice(0, 10);
    ikhwan += harian.get(t)?.ikhwan ?? 0;
    akhwat += harian.get(t)?.akhwat ?? 0;
    out.push({ tanggal: t, ikhwan, akhwat });
  }
  return out;
}

/** Tanggal antrean tertua genap `usiaMaksHari` — sejak itu sisa pita boleh digabung. */
export function tanggalBatasAntrean(pertama: string | null, usiaMaksHari: number): string | null {
  if (!pertama) return null;
  return new Date(new Date(`${pertama}T00:00:00Z`).getTime() + usiaMaksHari * HARI_MS).toISOString().slice(0, 10);
}

// ── Rincian level × kelompok umur per jam ─────────────────────────────────

export interface PendaftarLevel {
  id: string;
  slot_id: string | null;
  level_pilihan: string | null;
  pita_umur: KsPitaUmur | null;
  didaftar_pada: string | null;
}

export interface RincianLevelJam {
  slot_id: string;
  kelompok: Gender;
  lokasi: string | null;
  label: string;
  dasar: { muda: number; tua: number };
  lanjutan: { muda: number; tua: number };
  total: number;
  /** Pengajar yang masih bebas di jam ini. */
  pengajar: number;
  /** Kelompok yang siap dibentuk hari ini (penuh per level & umur, atau gabungan umur yang sudah boleh). */
  kelompokSekarang: number;
  /** Tanggal sisa lintas kelompok umur mulai boleh digabung; null bila sudah boleh atau tidak ada antrean. */
  tanggalGabung: string | null;
  /** Kelompok yang siap setelah tanggal gabung (sama dengan sekarang bila tak ada tanggal gabung). */
  kelompokSetelahGabung: number;
  /** Pendaftar yang tetap menunggu setelah semua kelompok terbentuk (tanpa batas pengajar). */
  sisaMenunggu: number;
  kendala: string;
  nada: 'merah' | 'kuning' | 'hijau' | 'netral';
}

/**
 * Rincian satu jam: berapa pendaftar per level (Dasar/Lanjutan) dan kelompok umur
 * (≤45 / 46+), berapa kelompok yang benar-benar bisa jadi halaqah, dan kendalanya.
 *
 * Angka "antre" per jam menyesatkan untuk jam kecil (offline): 19 pendaftar belum
 * tentu satu halaqah bila terbelah Dasar/Lanjutan dan dua kelompok umur. Kelompok
 * dihitung dengan fungsi yang SAMA dengan mesin alokasi (`kelompokkanPendaftar`),
 * dua kali: hari ini, dan pada tanggal sisa lintas umur mulai boleh digabung.
 */
export function susunRincianLevel(
  slots: readonly Pick<KsSlot, 'id' | 'kelompok' | 'lokasi' | 'label'>[],
  pendaftar: readonly PendaftarLevel[],
  pengajarBebas: ReadonlyMap<string, number>,
  aturan: Pick<KsPeriode, 'kapasitas_halaqah' | 'ambang_bawah' | 'usia_antrean_maks_hari'>,
  sekarang: Date
): RincianLevelJam[] {
  return slots.map((slot) => {
    const milik = pendaftar.filter((p) => p.slot_id === slot.id);
    const lanjut = (p: PendaftarLevel) => /lanjut/i.test(p.level_pilihan ?? '');
    const tua = (p: PendaftarLevel) => p.pita_umur === '46+';
    const dasar = { muda: milik.filter((p) => !lanjut(p) && !tua(p)).length, tua: milik.filter((p) => !lanjut(p) && tua(p)).length };
    const lanjutan = { muda: milik.filter((p) => lanjut(p) && !tua(p)).length, tua: milik.filter((p) => lanjut(p) && tua(p)).length };

    const alokasi: PendaftarAlokasi[] = milik.map((p) => ({
      id: p.id,
      slot_id: slot.id,
      level: p.level_pilihan ?? 'HITS Dasar',
      pita_umur: p.pita_umur,
      didaftar_pada: p.didaftar_pada,
    }));
    const kelompokSekarang = kelompokkanPendaftar(slot.id, alokasi, aturan, sekarang);

    // Syarat gabung dinilai dari pendaftar tertua DI SISA LEVEL itu, yang bisa jauh
    // lebih baru daripada pendaftar tertua di jam. Karena itu tanggalnya dicari:
    // hitung kelompok maksimum (saat semua sisa sudah cukup umur), lalu ambil
    // tanggal kandidat paling awal yang sudah mencapainya.
    const kandidat = [
      ...new Set(
        milik
          .map((p) => (p.didaftar_pada ? Date.parse(p.didaftar_pada) + aturan.usia_antrean_maks_hari * HARI_MS : NaN))
          .filter((t) => !Number.isNaN(t) && t > sekarang.getTime())
      ),
    ].sort((a, b) => a - b);
    let nanti: Date | null = null;
    let kelompokNanti = kelompokSekarang;
    if (kandidat.length > 0) {
      const maks = kelompokkanPendaftar(slot.id, alokasi, aturan, new Date(kandidat[kandidat.length - 1])).length;
      if (maks > kelompokSekarang.length) {
        for (const t of kandidat) {
          const k = kelompokkanPendaftar(slot.id, alokasi, aturan, new Date(t));
          if (k.length === maks) {
            nanti = new Date(t);
            kelompokNanti = k;
            break;
          }
        }
      }
    }
    const terkelompok = kelompokNanti.reduce((n, k) => n + k.pendaftar_ids.length, 0);

    const pengajar = pengajarBebas.get(slot.id) ?? 0;
    const k = kelompokNanti.length;
    const sisa = milik.length - terkelompok;
    const tglGabung = nanti ? nanti.toISOString().slice(0, 10) : null;

    let kendala: string;
    let nada: RincianLevelJam['nada'];
    if (milik.length === 0) {
      kendala = pengajar > 0 ? 'Tidak ada pendaftar — pengajar di jam ini belum terpakai' : 'Jam kosong';
      nada = pengajar > 0 ? 'kuning' : 'netral';
    } else if (pengajar === 0) {
      kendala = `Belum ada pengajar untuk ${milik.length} pendaftar`;
      nada = 'merah';
    } else if (k === 0) {
      kendala = 'Belum genap: butuh 12 orang per level & kelompok umur, atau ≥' + aturan.ambang_bawah + ' setelah antrean ' + aturan.usia_antrean_maks_hari + ' hari';
      nada = 'kuning';
    } else if (k > pengajar) {
      kendala = `${k} kelompok siap, pengajar ${pengajar} — butuh ${k - pengajar} pengajar lagi`;
      nada = 'merah';
    } else {
      kendala = k < pengajar ? `Cukup — ${pengajar - k} pengajar belum terpakai` : 'Cukup';
      nada = 'hijau';
    }
    if (milik.length > 0 && sisa > 0) kendala += ` · ${sisa} pendaftar menunggu genap`;

    return {
      slot_id: slot.id,
      kelompok: slot.kelompok,
      lokasi: slot.lokasi,
      label: slot.label.replace(/\s*WIB$/, ''),
      dasar,
      lanjutan,
      total: milik.length,
      pengajar,
      kelompokSekarang: kelompokSekarang.length,
      tanggalGabung: tglGabung,
      kelompokSetelahGabung: k,
      sisaMenunggu: sisa,
      kendala,
      nada,
    };
  });
}
