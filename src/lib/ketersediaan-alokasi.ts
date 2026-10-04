import type { KsHariIdx, KsPeriode, KsPitaUmur, KsSlot } from '@/types/db';
import { bentrokSalahSatu, type RentangJadwal, rentangDariSlot } from '@/lib/ketersediaan-slot';

/**
 * Mesin pembentukan halaqah dan alokasi pengajar.
 *
 * Sengaja murni (tanpa basis data) supaya dapat diuji dan diulang: masukan
 * berupa data yang sudah ditarik, keluaran berupa rencana. Penulisan ke basis
 * data ada di pemanggilnya, dan tidak ada satu pun halaqah lahir tanpa
 * koordinator menyetujuinya lebih dulu.
 *
 * Dua kaidah yang ditegakkan di sini:
 *
 *  1. "Semua usahakan kebagian dulu, baru diranking." Diterapkan sebagai alokasi
 *     berputar: pada putaran ke-N hanya pengajar yang sudah mendapat tepat N−1
 *     halaqah dalam alokasi ini yang boleh menerima. Jadi tidak seorang pun
 *     mendapat halaqah kedua sebelum semua yang bersedia mendapat yang pertama.
 *     Karena tidak ada batas atas per pengajar, putaran berjalan sampai slot
 *     atau pengajar habis.
 *
 *  2. Satu halaqah = satu level, dan umur pesertanya berdekatan. Pengelompokan
 *     dilakukan sebelum alokasi, sehingga jumlah halaqah yang dibutuhkan sebuah
 *     slot berasal dari kelompok yang benar-benar terbentuk — bukan sekadar
 *     pembagian jumlah pendaftar.
 */

const HARI_MS = 24 * 60 * 60 * 1000;

export interface PendaftarAlokasi {
  id: string;
  slot_id: string;
  level: string;
  pita_umur: KsPitaUmur | null;
  /** ISO. Menentukan urutan antrean dan usianya. */
  didaftar_pada: string | null;
}

export interface GrupUsulan {
  slot_id: string;
  level: string;
  pita_umur: KsPitaUmur | null;
  /** true bila dibentuk dengan menggabung pita karena antreannya sudah terlalu tua. */
  pita_digabung: boolean;
  pendaftar_ids: string[];
  /** Usia antrean tertua dalam kelompok ini, hari. */
  usia_tertua_hari: number;
}

function usiaHari(iso: string | null, sekarang: Date): number {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((sekarang.getTime() - d) / HARI_MS));
}

function urutAntrean(a: PendaftarAlokasi, b: PendaftarAlokasi): number {
  const ta = a.didaftar_pada ? new Date(a.didaftar_pada).getTime() : Number.MAX_SAFE_INTEGER;
  const tb = b.didaftar_pada ? new Date(b.didaftar_pada).getTime() : Number.MAX_SAFE_INTEGER;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/**
 * Kelompokkan pendaftar satu slot menjadi calon halaqah.
 *
 * Urutan: pisah per level → pisah per pita umur → urut antrean tertua dulu →
 * potong sebesar kapasitas.
 *
 * Sisa di bawah kapasitas menunggu, KECUALI antreannya sudah melewati
 * `usia_antrean_maks_hari`. Lewat batas itu sisa antar-pita dalam level yang
 * sama digabung dan boleh dibentuk asalkan mencapai `ambang_bawah`. Tanpa
 * kelonggaran ini, murid pada pita yang sepi mengendap selamanya.
 */
export function kelompokkanPendaftar(
  slotId: string,
  pendaftar: readonly PendaftarAlokasi[],
  periode: Pick<KsPeriode, 'kapasitas_halaqah' | 'ambang_bawah' | 'usia_antrean_maks_hari'>,
  sekarang: Date
): GrupUsulan[] {
  const grup: GrupUsulan[] = [];
  const perLevel = new Map<string, PendaftarAlokasi[]>();
  for (const p of pendaftar) {
    if (p.slot_id !== slotId) continue;
    if (!perLevel.has(p.level)) perLevel.set(p.level, []);
    perLevel.get(p.level)!.push(p);
  }

  for (const [level, orang] of perLevel) {
    const perPita = new Map<string, PendaftarAlokasi[]>();
    for (const p of orang) {
      const k = p.pita_umur ?? 'tanpa-umur';
      if (!perPita.has(k)) perPita.set(k, []);
      perPita.get(k)!.push(p);
    }

    const sisaSemuaPita: PendaftarAlokasi[] = [];

    for (const [pita, daftar] of perPita) {
      daftar.sort(urutAntrean);
      let i = 0;
      while (i + periode.kapasitas_halaqah <= daftar.length) {
        const potong = daftar.slice(i, i + periode.kapasitas_halaqah);
        grup.push({
          slot_id: slotId,
          level,
          pita_umur: pita === 'tanpa-umur' ? null : (pita as KsPitaUmur),
          pita_digabung: false,
          pendaftar_ids: potong.map((p) => p.id),
          usia_tertua_hari: usiaHari(potong[0].didaftar_pada, sekarang),
        });
        i += periode.kapasitas_halaqah;
      }
      // Sisa tidak langsung dibuang: ia masih bisa terbentuk lewat penggabungan
      // pita bila umur antreannya sudah melewati batas.
      sisaSemuaPita.push(...daftar.slice(i));
    }

    sisaSemuaPita.sort(urutAntrean);
    while (sisaSemuaPita.length >= periode.ambang_bawah) {
      const tertua = usiaHari(sisaSemuaPita[0].didaftar_pada, sekarang);
      if (tertua < periode.usia_antrean_maks_hari) break;
      const potong = sisaSemuaPita.splice(0, periode.kapasitas_halaqah);
      const pitaSama = new Set(potong.map((p) => p.pita_umur ?? 'tanpa-umur'));
      grup.push({
        slot_id: slotId,
        level,
        pita_umur: pitaSama.size === 1 ? potong[0].pita_umur : null,
        pita_digabung: pitaSama.size > 1,
        pendaftar_ids: potong.map((p) => p.id),
        usia_tertua_hari: tertua,
      });
    }
  }

  // Kelompok dengan antrean paling tua dilayani lebih dulu.
  return grup.sort((a, b) => b.usia_tertua_hari - a.usia_tertua_hari);
}

export interface SlotAlokasi {
  slot: Pick<KsSlot, 'id' | 'label' | 'hari_idx' | 'waktu_mulai' | 'waktu_selesai'>;
  grup: GrupUsulan[];
  /** Total antrean di slot ini — dipakai memutus urutan pelayanan. */
  antre: number;
  /** Usia antrean tertua di slot ini, hari. */
  usia_tertua_hari: number;
}

export interface MasukanAlokasi {
  slots: SlotAlokasi[];
  /** slot_id → daftar pengajar_id yang terverifikasi bersedia. */
  tersedia: Map<string, string[]>;
  /** slot_id → pengajar yang SUDAH memegang halaqah di slot itu pada periode ini. */
  sudahDiSlot: Map<string, Set<string>>;
  /** pengajar_id → jadwal yang sudah terpakai (HITS, Maahir, halaqah baru). */
  jadwalPengajar: Map<string, RentangJadwal[]>;
  /**
   * Nomor urut prioritas pengajar DI JAM ITU; kecil lebih didahulukan. Prioritas
   * dari xlsx berlaku per jam — pengajar yang sama bisa #1 di satu jam dan #4 di
   * jam lain. Hanya memutus urutan di dalam satu putaran; kaidah pemerataan tetap.
   */
  peringkat: (pengajarId: string, slotId: string) => number;
  /**
   * pengajar_id → halaqah hidup yang SUDAH dipegangnya dari alokasi sebelumnya
   * (semua periode aktif). Tanpa ini hitungan putaran mulai dari nol setiap kali
   * alokasi dijalankan, sehingga pengajar yang kemarin sudah dapat satu ikut
   * bersaing lagi di putaran pertama melawan yang belum dapat sama sekali.
   */
  sudahDapat?: ReadonlyMap<string, number>;
}

export interface Penempatan {
  slot_id: string;
  pengajar_id: string;
  grup: GrupUsulan;
  putaran: number;
  urutan_prioritas: number;
}

export interface HasilAlokasi {
  penempatan: Penempatan[];
  /** Kelompok yang siap tetapi tidak mendapat pengajar — inilah "butuh pengajar". */
  tanpaPengajar: GrupUsulan[];
  /** Putaran terakhir yang benar-benar menempatkan sesuatu; 0 bila tidak ada penempatan. */
  putaranTerpakai: number;
}

/**
 * Jalankan alokasi berputar.
 *
 * Batasan yang ditegakkan tiap penempatan:
 *  · seorang pengajar tidak boleh memegang dua halaqah pada slot yang sama —
 *    ia tidak bisa mengajar dua kelas serentak;
 *  · slot baru tidak boleh bertabrakan jam dengan halaqah lain miliknya,
 *    termasuk yang baru saja dijatah dalam alokasi ini;
 *  · pada putaran N hanya pengajar dengan tepat N−1 halaqah (lama + baru) yang
 *    boleh menerima. Halaqah lama ikut dihitung lewat `sudahDapat`; pengajar yang
 *    sudah memegang lebih banyak menunggu sampai putarannya tiba.
 */
export function alokasikan(masukan: MasukanAlokasi): HasilAlokasi {
  const penempatan: Penempatan[] = [];
  const dapat = new Map<string, number>(masukan.sudahDapat ?? []);
  const jadwal = new Map<string, RentangJadwal[]>();
  for (const [k, v] of masukan.jadwalPengajar) jadwal.set(k, [...v]);
  const terpakaiDiSlot = new Map<string, Set<string>>();
  for (const [k, v] of masukan.sudahDiSlot) terpakaiDiSlot.set(k, new Set(v));

  // Antrean tertua dilayani lebih dulu, lalu yang peminatnya paling banyak.
  const slots = [...masukan.slots].sort((a, b) => {
    if (b.usia_tertua_hari !== a.usia_tertua_hari) return b.usia_tertua_hari - a.usia_tertua_hari;
    return b.antre - a.antre;
  });

  const sisaGrup = new Map<string, GrupUsulan[]>();
  for (const s of slots) sisaGrup.set(s.slot.id, [...s.grup]);

  // Putaran dimulai dari jumlah halaqah paling sedikit yang sudah dipegang
  // kandidat mana pun: bila semua sudah dapat satu, putaran 1 kosong dan tak
  // boleh menghentikan alokasi.
  const semuaKandidat = [...new Set([...masukan.tersedia.values()].flat())];
  const minimumDapat = semuaKandidat.length
    ? Math.min(...semuaKandidat.map((p) => dapat.get(p) ?? 0))
    : 0;
  let putaran = minimumDapat + 1;
  let putaranTerakhir = 0;
  const BATAS_PUTARAN = putaran + 100; // penjaga; alokasi nyata berhenti jauh sebelum ini

  while (putaran <= BATAS_PUTARAN) {
    let ditempatkan = 0;

    for (const s of slots) {
      const antrian = sisaGrup.get(s.slot.id) ?? [];
      if (antrian.length === 0) continue;
      const rentang = rentangDariSlot(s.slot);
      if (rentang.length === 0) continue;

      const sudah = terpakaiDiSlot.get(s.slot.id) ?? new Set<string>();
      terpakaiDiSlot.set(s.slot.id, sudah);

      // Terus menempatkan selama masih ada kelompok dan kandidat yang sah pada
      // putaran ini. Beberapa pengajar berbeda boleh mengisi slot yang sama.
      for (;;) {
        if (antrian.length === 0) break;

        const kandidat = (masukan.tersedia.get(s.slot.id) ?? [])
          .filter((p) => !sudah.has(p))
          .filter((p) => (dapat.get(p) ?? 0) === putaran - 1)
          .filter((p) => !bentrokSalahSatu(jadwal.get(p) ?? [], rentang))
          .sort((a, b) => {
            const pa = masukan.peringkat(a, s.slot.id);
            const pb = masukan.peringkat(b, s.slot.id);
            if (pa !== pb) return pa - pb;
            return a.localeCompare(b);
          });

        if (kandidat.length === 0) break;

        const pilih = kandidat[0];
        const grup = antrian.shift()!;
        penempatan.push({
          slot_id: s.slot.id,
          pengajar_id: pilih,
          grup,
          putaran,
          urutan_prioritas: masukan.peringkat(pilih, s.slot.id),
        });
        sudah.add(pilih);
        dapat.set(pilih, (dapat.get(pilih) ?? 0) + 1);
        if (!jadwal.has(pilih)) jadwal.set(pilih, []);
        jadwal.get(pilih)!.push(...rentang);
        ditempatkan += 1;
      }
    }

    if (ditempatkan === 0) {
      // Putaran kosong baru berarti selesai bila tak ada lagi pengajar yang
      // menunggu putaran lebih tinggi (mis. yang sudah memegang dua halaqah lama)
      // dan masih ada kelompok tersisa.
      const masihAda = [...sisaGrup.values()].some((g) => g.length > 0);
      const adaYangLebihTinggi = semuaKandidat.some((p) => (dapat.get(p) ?? 0) >= putaran);
      if (!masihAda || !adaYangLebihTinggi) break;
    } else {
      putaranTerakhir = putaran;
    }
    putaran += 1;
  }

  const tanpaPengajar: GrupUsulan[] = [];
  for (const sisa of sisaGrup.values()) tanpaPengajar.push(...sisa);

  return { penempatan, tanpaPengajar, putaranTerpakai: putaranTerakhir };
}

