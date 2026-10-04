import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPeriode, KsPitaUmur, KsSlot } from '@/types/db';
import { listSlot } from '@/lib/ketersediaan-periode';
import { bentrok, kunciJamMaster, masihBerjalanPada, rentangDariSlot, sesiDariSlot } from '@/lib/ketersediaan-slot';
import type { JadwalTerpakai } from '@/lib/ketersediaan-bentrok';
import { jadwalTerpakaiPengajar } from '@/lib/ketersediaan-bentrok';
import { alokasikan, kelompokkanPendaftar, type PendaftarAlokasi, type SlotAlokasi } from '@/lib/ketersediaan-alokasi';
import { identitasPendaftar } from '@/lib/ketersediaan-pendaftar';
import type { RingkasSlot } from '@/lib/ketersediaan-permintaan';

/**
 * Pandangan gabungan beberapa tahap yang berbagi pendaftar yang sama.
 *
 * Batch Oktober 2026 dibuka dua tahap (mulai 5 dan 21 Oktober) dari satu
 * formulir. Pertanyaan koordinator bukan "berapa yang tertampung di tahap 1"
 * melainkan "berapa dari seluruh pendaftar yang bisa kita tampung dengan semua
 * pengajar kedua tahap". Jawabannya dihitung di sini:
 *
 *  · jam disatukan lewat `kunciJamMaster` (gender, mode, jam per hari, dan lokasi
 *    untuk offline), karena tiap periode punya baris ks_slot sendiri untuk jam
 *    yang sama — Pejaten dan Matraman di jam yang sama tetap dua jam;
 *  · pendaftar disatukan per orang (nomor + nama) — orang yang ada di CSV kedua
 *    tahap dihitung sekali; orang yang sudah dialokasikan di tahap mana pun
 *    diwakili baris dialokasikannya, jadi tidak ikut antre lagi di tahap lain;
 *  · pengajar di jam yang sama pada dua tahap dihitung sekali: kedua tahap
 *    berjalan bersamaan, jadi ia tetap hanya bisa memegang satu kelas di jam itu;
 *  · daya tampung TIDAK diperkirakan dari jumlah pengajar per jam — pengajar yang
 *    menyanggupi lima jam akan terhitung lima kali. Mesin alokasi yang sama
 *    dijalankan di memori, tanpa menulis apa pun, dan hasilnya yang dilaporkan.
 */

const STATUS_HIDUP = ['disetujui', 'menunggu', 'dikonfirmasi', 'dikirim'];

export interface JamGabungan {
  /** Baris slot wakil (dari tahap pertama yang memilikinya) — dipakai tampilan. */
  slot: KsSlot;
  /** Pengajar per tahap di jam ini: nama periode → jumlah orang. */
  pengajarPerTahap: { periode: string; pengajar: number }[];
}

export interface HasilGabungan {
  periode: Pick<KsPeriode, 'id' | 'nama' | 'mulai'>[];
  slots: KsSlot[];
  ringkas: Map<string, RingkasSlot>;
  jam: Map<string, JamGabungan>;
  /** Hasil simulasi alokasi per gender. */
  simulasi: Record<Gender, { halaqah: number; peserta: number; antre: number; pengajarDapat: number }>;
  /** Peserta tertampung per slot wakil menurut simulasi. */
  tampungSim: Map<string, number>;
  /** Kelompok yang sudah genap tetapi tidak mendapat pengajar, per slot wakil — "butuh N halaqah". */
  butuhHalaqah: Map<string, number>;
  /**
   * Pengajar unik per gender dan per tahap: punya jam, tidak nonaktif, dan masih
   * tersedia di sekurangnya satu jam setelah jam yang bentrok dengan jadwal
   * lamanya dikeluarkan.
   */
  pengajar: Record<Gender, { total: number; perTahap: { periode: string; n: number }[] }>;
  tertahan: Record<Gender, number>;
}

export async function susunGabungan(daftarPeriode: readonly KsPeriode[], sekarang: Date): Promise<HasilGabungan> {
  const periode = [...daftarPeriode].sort((a, b) => a.mulai.localeCompare(b.mulai));
  const idPeriode = periode.map((p) => p.id);
  const namaPeriode = new Map(periode.map((p) => [p.id, p.nama]));
  const mulaiPeriode = new Map(periode.map((p) => [p.id, p.mulai]));
  const acuan = periode[0]?.mulai ?? null;
  const aturan = periode[0];

  // ── Jam: satukan lewat kunci jadwal ──
  const slotPer = await Promise.all(periode.map((p) => listSlot(p.id, { hanyaAktif: true })));
  const kunciSlot = new Map<string, string>(); // slot_id → kunci
  const wakil = new Map<string, KsSlot>(); // kunci → slot wakil
  slotPer.flat().forEach((s) => {
    const k = kunciJamMaster(s.kelompok, s.mode, sesiDariSlot(s), s.lokasi);
    kunciSlot.set(s.id, k);
    if (!wakil.has(k)) wakil.set(k, s);
  });
  const idWakil = (slotId: string | null) => {
    const k = slotId ? kunciSlot.get(slotId) : undefined;
    return k ? wakil.get(k)!.id : null;
  };

  const [{ data: pendRows }, { data: ketRows }, { data: usulRows }] = await Promise.all([
    supabaseAdmin
      .from('ks_pendaftar')
      .select('id, slot_id, status, didaftar_pada, wa_normal, nama, gender, level_pilihan, pita_umur')
      .in('periode_id', idPeriode),
    supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, status, prioritas, pengisian:pengisian_id(pengajar_id, periode_id, status)')
      .in('status', ['terverifikasi', 'diajukan']),
    supabaseAdmin
      .from('ks_usulan')
      .select('slot_id, pengajar_id')
      .in('periode_id', idPeriode)
      .in('status', STATUS_HIDUP),
  ]);

  // ── Pendaftar: satu orang satu baris ──
  type Pend = {
    id: string;
    slot_id: string | null;
    status: string;
    didaftar_pada: string | null;
    wa_normal: string | null;
    nama: string;
    gender: Gender | null;
    level_pilihan: string | null;
    pita_umur: KsPitaUmur | null;
  };
  const bobot: Record<string, number> = { dialokasikan: 3, valid: 2, ditahan: 1 };
  const perOrang = new Map<string, Pend>();
  for (const p of (pendRows ?? []) as Pend[]) {
    if (!(p.status in bobot)) continue;
    const id = identitasPendaftar(p.wa_normal, p.nama) ?? `baris:${p.id}`;
    const lama = perOrang.get(id);
    if (
      !lama ||
      bobot[p.status] > bobot[lama.status] ||
      (bobot[p.status] === bobot[lama.status] && (p.didaftar_pada ?? '') > (lama.didaftar_pada ?? ''))
    ) {
      perOrang.set(id, p);
    }
  }

  const antre = new Map<string, number>();
  const dialokasikan = new Map<string, number>();
  const tertua = new Map<string, number>();
  const tertahan: Record<Gender, number> = { ikhwan: 0, akhwat: 0 };
  const pendaftarAlokasi: PendaftarAlokasi[] = [];
  for (const p of perOrang.values()) {
    if (p.status === 'ditahan') {
      if (p.gender) tertahan[p.gender]++;
      continue;
    }
    const sid = idWakil(p.slot_id);
    if (!sid) continue;
    if (p.status === 'dialokasikan') {
      dialokasikan.set(sid, (dialokasikan.get(sid) ?? 0) + 1);
      continue;
    }
    antre.set(sid, (antre.get(sid) ?? 0) + 1);
    if (p.didaftar_pada) {
      const hari = Math.floor((sekarang.getTime() - new Date(p.didaftar_pada).getTime()) / 86_400_000);
      if (hari >= 0) tertua.set(sid, Math.max(tertua.get(sid) ?? 0, hari));
    }
    pendaftarAlokasi.push({
      id: p.id,
      slot_id: sid,
      level: p.level_pilihan ?? 'HITS Dasar',
      pita_umur: p.pita_umur,
      didaftar_pada: p.didaftar_pada,
    });
  }

  // ── Pengajar: per jam gabungan, dihitung sekali lintas tahap ──
  const tersedia = new Map<string, Set<string>>(); // slot wakil → pengajar
  const perTahapJam = new Map<string, Map<string, Set<string>>>(); // slot wakil → periode → pengajar
  const prioritasJam = new Map<string, number>();
  /** `${slot wakil}|${pengajar}` → tanggal mulai tahap paling akhir tempat ia menawarkan jam itu. */
  const acuanJam = new Map<string, string>();
  const pengajarGender = new Map<string, Gender>();
  for (const k of (ketRows ?? []) as {
    slot_id: string;
    prioritas: number | null;
    pengisian?: { pengajar_id: string; periode_id: string; status: string } | null;
  }[]) {
    const p = k.pengisian;
    if (!p || p.status === 'nonaktif' || !namaPeriode.has(p.periode_id)) continue;
    const sid = idWakil(k.slot_id);
    if (!sid) continue;
    if (!tersedia.has(sid)) tersedia.set(sid, new Set());
    tersedia.get(sid)!.add(p.pengajar_id);
    if (!perTahapJam.has(sid)) perTahapJam.set(sid, new Map());
    const pt = perTahapJam.get(sid)!;
    if (!pt.has(p.periode_id)) pt.set(p.periode_id, new Set());
    pt.get(p.periode_id)!.add(p.pengajar_id);
    pengajarGender.set(p.pengajar_id, wakil.get(kunciSlot.get(k.slot_id)!)!.kelompok);
    const kp = `${sid}|${p.pengajar_id}`;
    const mulai = mulaiPeriode.get(p.periode_id)!;
    if (!acuanJam.has(kp) || mulai > acuanJam.get(kp)!) acuanJam.set(kp, mulai);
    if (k.prioritas !== null) prioritasJam.set(kp, Math.min(prioritasJam.get(kp) ?? Infinity, k.prioritas));
  }

  const sudahDiSlot = new Map<string, Set<string>>();
  const halaqahHidup = new Map<string, number>();
  for (const u of (usulRows ?? []) as { slot_id: string; pengajar_id: string | null }[]) {
    const sid = idWakil(u.slot_id);
    if (!sid) continue;
    halaqahHidup.set(sid, (halaqahHidup.get(sid) ?? 0) + 1);
    if (u.pengajar_id) {
      if (!sudahDiSlot.has(sid)) sudahDiSlot.set(sid, new Set());
      sudahDiSlot.get(sid)!.add(u.pengajar_id);
    }
  }

  // ── Jadwal lama tiap pengajar (halaqah berjalan, kelas Maahir) ──
  // Bentrok dinilai per jam pada tanggal mulai TAHAP tempat pengajar menawarkan
  // jam itu: halaqah April yang selesai 11 Oktober mengunci jam di tahap yang
  // mulai 5 Oktober, tetapi tidak di tahap yang mulai 21 Oktober. Pengajar yang
  // bentrok dikeluarkan dari daftar tersedia jam itu sebelum simulasi.
  const jadwalLama = new Map<string, JadwalTerpakai[]>();
  const cacheSelesaiBatch = new Map<string, string | null>();
  const semuaPengajar = [...pengajarGender.keys()];
  for (let i = 0; i < semuaPengajar.length; i += 8) {
    await Promise.all(
      semuaPengajar.slice(i, i + 8).map(async (id) => {
        jadwalLama.set(id, await jadwalTerpakaiPengajar(id, { acuan, cacheSelesaiBatch }));
      })
    );
  }
  const slotWakilById = new Map([...wakil.values()].map((s) => [s.id, s]));
  for (const [sid, orang] of tersedia) {
    const rentang = rentangDariSlot(slotWakilById.get(sid)!);
    for (const pid of [...orang]) {
      const acuanTahap = acuanJam.get(`${sid}|${pid}`) ?? acuan;
      const kunci = (jadwalLama.get(pid) ?? []).some(
        (t) => masihBerjalanPada(t.selesai, acuanTahap) && rentang.some((r) => bentrok(r, t.rentang))
      );
      if (kunci) orang.delete(pid);
    }
  }

  // ── Simulasi alokasi, tanpa menulis ──
  const slotsWakil = [...wakil.values()];
  const slotAlokasi: SlotAlokasi[] = [];
  for (const s of slotsWakil) {
    const milik = pendaftarAlokasi.filter((p) => p.slot_id === s.id);
    if (milik.length === 0 || !aturan) continue;
    const grup = kelompokkanPendaftar(s.id, milik, aturan, sekarang);
    if (grup.length === 0) continue;
    slotAlokasi.push({
      slot: s,
      grup,
      antre: milik.length,
      usia_tertua_hari: Math.max(0, ...grup.map((g) => g.usia_tertua_hari)),
    });
  }
  const hasil = alokasikan({
    slots: slotAlokasi,
    tersedia: new Map([...tersedia].map(([k, v]) => [k, [...v]])),
    sudahDiSlot,
    jadwalPengajar: new Map(),
    peringkat: (id, slotId) => prioritasJam.get(`${slotId}|${id}`) ?? 99,
  });

  const tampungSim = new Map<string, number>();
  const kosong = () => ({ halaqah: 0, peserta: 0, antre: 0, pengajarDapat: 0 });
  const simulasi: HasilGabungan['simulasi'] = { ikhwan: kosong(), akhwat: kosong() };
  const dapat: Record<Gender, Set<string>> = { ikhwan: new Set(), akhwat: new Set() };
  for (const pn of hasil.penempatan) {
    const g = wakil.get(kunciSlot.get(pn.slot_id)!)!.kelompok;
    simulasi[g].halaqah++;
    simulasi[g].peserta += pn.grup.pendaftar_ids.length;
    dapat[g].add(pn.pengajar_id);
    tampungSim.set(pn.slot_id, (tampungSim.get(pn.slot_id) ?? 0) + pn.grup.pendaftar_ids.length);
  }
  for (const s of slotsWakil) simulasi[s.kelompok].antre += antre.get(s.id) ?? 0;
  const butuhHalaqah = new Map<string, number>();
  for (const g of hasil.tanpaPengajar) butuhHalaqah.set(g.slot_id, (butuhHalaqah.get(g.slot_id) ?? 0) + 1);
  simulasi.ikhwan.pengajarDapat = dapat.ikhwan.size;
  simulasi.akhwat.pengajarDapat = dapat.akhwat.size;

  // ── Ringkasan per jam dalam bentuk yang sama dengan satu periode ──
  const ringkas = new Map<string, RingkasSlot>();
  const jam = new Map<string, JamGabungan>();
  for (const s of slotsWakil) {
    const a = antre.get(s.id) ?? 0;
    const pengajarN = tersedia.get(s.id)?.size ?? 0;
    const terpakai = sudahDiSlot.get(s.id)?.size ?? 0;
    const bebas = Math.max(0, pengajarN - terpakai);
    const butuh = Math.ceil(a / (aturan?.kapasitas_halaqah ?? 12));
    const tampung = tampungSim.get(s.id) ?? 0;
    ringkas.set(s.id, {
      slot_id: s.id,
      antre: a,
      dialokasikan: dialokasikan.get(s.id) ?? 0,
      ditahan: 0,
      terpakai_lain: 0,
      pengajar_tersedia: pengajarN,
      pengajar_terpakai: terpakai,
      halaqah_hidup: halaqahHidup.get(s.id) ?? 0,
      butuh_halaqah: butuh,
      dapat_dibentuk: Math.min(butuh, bebas),
      belum_tertampung: Math.max(0, a - tampung),
      antrean_tertua_hari: tertua.get(s.id) ?? null,
      butuh_pengajar: a >= (aturan?.ambang_bentuk ?? 12) && bebas === 0,
      riwayat: null,
    });
    jam.set(s.id, {
      slot: s,
      pengajarPerTahap: periode.map((p) => ({
        periode: p.nama,
        pengajar: perTahapJam.get(s.id)?.get(p.id)?.size ?? 0,
      })),
    });
  }

  // Pengajar yang seluruh jamnya bentrok tidak bisa memegang kelas apa pun —
  // menghitungnya membuat "pengajar tersedia" lebih besar dari kenyataan.
  const masihTersedia = new Set<string>();
  for (const orang of tersedia.values()) for (const pid of orang) masihTersedia.add(pid);
  const tersediaTahap = new Map<string, Set<string>>(); // periode → pengajar yang masih tersedia di jam tahap itu
  for (const [sid, pt] of perTahapJam) {
    const orang = tersedia.get(sid);
    if (!orang) continue;
    for (const [periodeId, set] of pt) {
      if (!tersediaTahap.has(periodeId)) tersediaTahap.set(periodeId, new Set());
      for (const id of set) if (orang.has(id)) tersediaTahap.get(periodeId)!.add(id);
    }
  }

  const pengajar: HasilGabungan['pengajar'] = {
    ikhwan: { total: 0, perTahap: [] },
    akhwat: { total: 0, perTahap: [] },
  };
  for (const g of ['ikhwan', 'akhwat'] as const) {
    pengajar[g].total = semuaPengajar.filter((id) => pengajarGender.get(id) === g && masihTersedia.has(id)).length;
    pengajar[g].perTahap = periode.map((p) => ({
      periode: p.nama,
      n: [...(tersediaTahap.get(p.id) ?? [])].filter((id) => pengajarGender.get(id) === g).length,
    }));
  }

  return {
    periode: periode.map(({ id, nama, mulai }) => ({ id, nama, mulai })),
    slots: slotsWakil,
    ringkas,
    jam,
    simulasi,
    tampungSim,
    butuhHalaqah,
    pengajar,
    tertahan,
  };
}
