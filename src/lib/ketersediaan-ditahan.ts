import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import type { Gender, KsPitaUmur } from '@/types/db';

/**
 * Pendaftar yang tertahan saringan mutu.
 *
 * Layar ini ada karena saringannya tanpa layar tidak ada gunanya: pada tarikan
 * nyata pertama, 474 dari 1.341 baris tertahan — 186 di antaranya nomor WA
 * ganda yang hanya bisa dibereskan manusia. Tanpa tempat melihat baris mana dan
 * kenapa, angka itu cuma jadi selisih yang tak pernah dikejar.
 *
 * Yang ditampilkan sengaja bukan seluruh isi baris: nama dan nomor perlu terlihat
 * supaya koordinator bisa mencarinya di sheet, tetapi halaman ini hanya untuk
 * koordinator — bukan untuk pengajar, yang cukup melihat angka agregat.
 */

export interface BarisDitahan {
  id: string;
  nama: string;
  wa: string | null;
  umur: number | null;
  pita_umur: KsPitaUmur | null;
  gender: Gender | null;
  level_pilihan: string | null;
  slot_label_raw: string | null;
  slot_id: string | null;
  rekaman_url: string | null;
  didaftar_pada: string | null;
  alasan: string[];
}

export interface RingkasDitahan {
  total: number;
  /** Alasan → berapa baris. Satu baris bisa punya lebih dari satu alasan. */
  perAlasan: { alasan: string; jumlah: number }[];
  /** Nilai slot mentah yang tak dikenali, beserta jumlahnya. */
  slotAsing: { nilai: string; jumlah: number }[];
  baris: BarisDitahan[];
}

/** Samarkan isi kutip supaya alasan yang membawa nilai tetap dapat dikelompokkan. */
function kunciAlasan(a: string): string {
  return a.replace(/"[^"]*"/, '"…"');
}

export async function ringkasDitahan(
  periodeId: string,
  opts: { batas?: number; gender?: Gender } = {}
): Promise<RingkasDitahan> {
  const batas = opts.batas ?? 300;

  const { data } = await supabaseAdmin
    .from('ks_pendaftar')
    .select(
      'id, nama, wa, umur, pita_umur, gender, level_pilihan, slot_label_raw, slot_id, rekaman_url, didaftar_pada, alasan_ditahan'
    )
    .eq('periode_id', periodeId)
    .eq('status', 'ditahan')
    .order('didaftar_pada', { ascending: true });

  const semua = ((data ?? []) as (BarisDitahan & { alasan_ditahan: string[] })[]).map((r) => ({
    id: r.id,
    nama: r.nama,
    wa: r.wa,
    umur: r.umur,
    pita_umur: r.pita_umur,
    gender: r.gender,
    level_pilihan: r.level_pilihan,
    slot_label_raw: r.slot_label_raw,
    slot_id: r.slot_id,
    rekaman_url: r.rekaman_url,
    didaftar_pada: r.didaftar_pada,
    alasan: r.alasan_ditahan ?? [],
  }))
    // Disaring sebelum dijumlah, supaya angka per alasan cocok dengan lencana
    // tab yang menghitung satu gender. Baris tanpa gender hanya tampil di "Semua".
    .filter((r) => !opts.gender || r.gender === opts.gender);

  const perAlasan = new Map<string, number>();
  const slotAsing = new Map<string, number>();
  for (const b of semua) {
    for (const a of b.alasan) perAlasan.set(kunciAlasan(a), (perAlasan.get(kunciAlasan(a)) ?? 0) + 1);
    // Slot yang tidak terpetakan: nilainya perlu dilihat utuh, bukan disamarkan,
    // karena dari situlah koordinator tahu slot apa yang perlu ditambahkan.
    if (!b.slot_id && b.slot_label_raw) {
      slotAsing.set(b.slot_label_raw, (slotAsing.get(b.slot_label_raw) ?? 0) + 1);
    }
  }

  return {
    total: semua.length,
    perAlasan: [...perAlasan].map(([alasan, jumlah]) => ({ alasan, jumlah })).sort((a, b) => b.jumlah - a.jumlah),
    slotAsing: [...slotAsing].map(([nilai, jumlah]) => ({ nilai, jumlah })).sort((a, b) => b.jumlah - a.jumlah),
    baris: semua.slice(0, batas),
  };
}

/**
 * Catat statistik periode berjalan ke ks_slot_riwayat.
 *
 * Rancangan menjanjikan pengajar melihat "peluang slot benar-benar terbentuk",
 * dan tabelnya sejak awal hanya pernah DIBACA — tidak ada yang mengisinya. Janji
 * itu karena itu tidak akan pernah ditepati walau sistemnya berjalan bertahun.
 *
 * Dipanggil saat periode ditutup dan boleh dipanggil ulang: barisnya di-upsert
 * per (periode, slot), jadi menjalankannya dua kali tidak menggandakan apa pun.
 * Baris `sumber='impor'` milik periode lampau tidak disentuh.
 */
export async function catatRiwayatPeriode(
  periodeId: string
): Promise<{ slot: number; terbentuk: number; batal: number }> {
  const { data: periode } = await supabaseAdmin
    .from('ks_periode')
    .select('id, nama')
    .eq('id', periodeId)
    .maybeSingle();
  if (!periode) return { slot: 0, terbentuk: 0, batal: 0 };

  const { data: slots } = await supabaseAdmin
    .from('ks_slot')
    .select('id, label, kelompok, mode')
    .eq('periode_id', periodeId);

  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('slot_id, status')
    .eq('periode_id', periodeId);

  const { data: pendaftar } = await supabaseAdmin
    .from('ks_pendaftar')
    .select('slot_id, status')
    .eq('periode_id', periodeId);

  // "Terbentuk" = benar-benar sampai ke pengajar dan diterima. Usulan yang masih
  // menunggu persetujuan bukan bukti slotnya jadi, jadi tidak dihitung.
  const TERBENTUK = new Set(['dikonfirmasi', 'dikirim']);
  const BATAL = new Set(['ditolak', 'kedaluwarsa', 'batal', 'gagal']);

  const terbentukPer = new Map<string, number>();
  const batalPer = new Map<string, number>();
  for (const u of (usulan ?? []) as { slot_id: string; status: string }[]) {
    if (TERBENTUK.has(u.status)) terbentukPer.set(u.slot_id, (terbentukPer.get(u.slot_id) ?? 0) + 1);
    else if (BATAL.has(u.status)) batalPer.set(u.slot_id, (batalPer.get(u.slot_id) ?? 0) + 1);
  }

  const pendaftarPer = new Map<string, number>();
  for (const p of (pendaftar ?? []) as { slot_id: string | null; status: string }[]) {
    if (!p.slot_id || p.status === 'ditahan' || p.status === 'batal') continue;
    pendaftarPer.set(p.slot_id, (pendaftarPer.get(p.slot_id) ?? 0) + 1);
  }

  const sekarang = new Date().toISOString();
  let jumlahSlot = 0;
  let totalTerbentuk = 0;
  let totalBatal = 0;

  for (const s of (slots ?? []) as { id: string; label: string; kelompok: Gender; mode: string }[]) {
    const terbentuk = terbentukPer.get(s.id) ?? 0;
    const batal = batalPer.get(s.id) ?? 0;
    const jml = pendaftarPer.get(s.id) ?? 0;
    if (terbentuk === 0 && batal === 0 && jml === 0) continue;

    const baris = {
      periode_label: periode.nama as string,
      slot_label: s.label,
      kelompok: s.kelompok,
      mode: s.mode,
      halaqah_terbentuk: terbentuk,
      halaqah_batal: batal,
      pendaftar: jml,
      sumber: 'sistem' as const,
      updated_at: sekarang,
    };

    const { data: ada } = await supabaseAdmin
      .from('ks_slot_riwayat')
      .select('id')
      .eq('periode_label', baris.periode_label)
      .eq('slot_label', baris.slot_label)
      .eq('kelompok', baris.kelompok)
      .eq('mode', baris.mode)
      .maybeSingle();

    if (ada) await supabaseAdmin.from('ks_slot_riwayat').update(baris).eq('id', ada.id);
    else await supabaseAdmin.from('ks_slot_riwayat').insert(baris);

    jumlahSlot++;
    totalTerbentuk += terbentuk;
    totalBatal += batal;
  }

  return { slot: jumlahSlot, terbentuk: totalTerbentuk, batal: totalBatal };
}
