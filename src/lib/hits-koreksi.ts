import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadHalaqahPertemuan } from '@/lib/hits-ketua';
import { normalizeWhatsApp } from '@/lib/whatsapp';
import type { HitsLevel } from '@/types/db';

export type KoreksiJenis = 'set_mulai' | 'tambah' | 'hapus' | 'ubah_tanggal';

export type KoreksiItemInput = {
  jenis: KoreksiJenis;
  level?: HitsLevel | null;
  pertemuan_no?: number | null;
  tanggal?: string | null; // YYYY-MM-DD
  catatan?: string | null;
};

export type KoreksiApprover = { name: string; wa: string };

/**
 * Penerima pengajuan koreksi pertemuan, per gender halaqah. Ditulis eksplisit —
 * dulu "koordinator ketua kelas aktif PERTAMA yang cocok gender", dan urutan
 * baris tak dijamin, sehingga pengajuan bisa nyasar ke koordinator lain.
 * Konstanta supaya pergantian pemegangnya terekam di git; ENV disediakan untuk
 * ganti cepat tanpa deploy. Pola sama dengan TUJUAN_WA di shakwa.ts.
 *
 * Sisi ikhwan dipegang berdua dan digilir per pengajuan (lihat `urutanKoreksi`).
 * Nama TANPA titel — template WA sudah menambah "Ustadz/Ustadzah" sendiri.
 * Pemegang wajib punya baris aktif di `koordinator_ketua_kelas`: halaman putusan
 * dijaga requireKoordinatorKetuaKelas().
 */
export const KOREKSI_APPROVER: Record<'ikhwan' | 'akhwat', KoreksiApprover[]> = {
  ikhwan: [
    {
      name: process.env.KOREKSI_NAMA_APPROVER_IKHWAN || 'Ahmad Nur Nugroho',
      wa: process.env.KOREKSI_WA_APPROVER_IKHWAN || '081547229165',
    },
    {
      name: process.env.KOREKSI_NAMA_APPROVER_IKHWAN_2 || 'Luthfi Zahira Pratama',
      wa: process.env.KOREKSI_WA_APPROVER_IKHWAN_2 || '081266623790',
    },
  ],
  akhwat: [
    {
      name: process.env.KOREKSI_NAMA_APPROVER_AKHWAT || 'Yusuf Handayani',
      wa: process.env.KOREKSI_WA_APPROVER_AKHWAT || '081331947687',
    },
  ],
};

/**
 * Nomor giliran untuk gender yang pemegangnya lebih dari satu: jumlah pengajuan
 * koreksi gender itu yang sudah tersimpan. Dihitung SEBELUM baris baru disimpan,
 * jadi pengajuan pertama → indeks 0. Gender berpemegang tunggal tak perlu query.
 */
export async function urutanKoreksi(gender: 'ikhwan' | 'akhwat'): Promise<number> {
  if (KOREKSI_APPROVER[gender].length < 2) return 0;
  // Gender ada di halaqah, bukan di baris koreksi — shim tak bisa memfilter
  // kolom embed, jadi disaring di sini. Tabelnya kecil (satu baris per pengajuan).
  const { data, error } = await supabaseAdmin
    .from('hits_pertemuan_koreksi')
    .select('id, halaqah:halaqah_id(gender)');
  if (error) {
    // Gagal hitung bukan alasan menggagalkan pengajuan — jatuh ke pemegang pertama.
    console.error('koreksi: gagal hitung giliran approver', error);
    return 0;
  }
  return (data ?? []).filter((r) => (r.halaqah as unknown as { gender: string | null } | null)?.gender === gender).length;
}

/**
 * Penerima pengajuan sesuai gender halaqah. `urutan` memutar giliran saat
 * slotnya dipegang beberapa orang. Pemegang yang barisnya sudah tak aktif
 * dilewati — kalau semuanya tak aktif, jatuh ke koordinator KK aktif mana pun
 * (perilaku lama) supaya pengajuan tetap bisa diputuskan.
 */
export async function determineKoreksiApprover(
  gender: 'ikhwan' | 'akhwat',
  urutan = 0
): Promise<KoreksiApprover | null> {
  const { data } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, gender, whatsapp_number')
    .eq('active', true);
  const aktif = new Set(
    (data ?? []).filter((k) => k.whatsapp_number).map((k) => normalizeWhatsApp(k.whatsapp_number))
  );

  const slot = KOREKSI_APPROVER[gender].filter((a) => aktif.has(normalizeWhatsApp(a.wa)));
  if (slot.length > 0) {
    const idx = ((urutan % slot.length) + slot.length) % slot.length;
    return slot[idx];
  }

  const pick =
    (data ?? []).find((k) => k.gender === gender && k.whatsapp_number) ??
    (data ?? []).find((k) => k.whatsapp_number);
  return pick ? { name: pick.name, wa: pick.whatsapp_number } : null;
}

export type ApplyKoreksiResult = { ok: true } | { ok: false; error: string };

/**
 * Nomor pertemuan yang SEDANG dipakai untuk satu tahap (dari daftar terderivasi,
 * jadi yang sudah dihapus/di-skip TIDAK terhitung — nomornya boleh dipakai lagi).
 */
export async function pertemuanNoTerpakai(halaqahId: string, level: string): Promise<Set<number>> {
  const loaded = await loadHalaqahPertemuan(halaqahId);
  const used = new Set<number>();
  for (const d of loaded?.derived ?? []) if (d.level === level) used.add(d.pertemuan_no);
  return used;
}

/**
 * Validasi item `tambah` yang menyebut nomor pertemuan eksplisit: nomor wajar &
 * belum dipakai. Dipakai saat ketua mengajukan DAN diulang saat koordinator Acc
 * — jeda ajukan→Acc bisa berhari-hari dan daftar pertemuan bisa berubah di antaranya.
 * Return pesan error, atau null bila semua aman.
 */
export async function validateKoreksiItems(
  halaqahId: string,
  items: { jenis: string; level?: string | null; pertemuan_no?: number | null }[]
): Promise<string | null> {
  const perLevel = new Map<string, Set<number>>();
  for (const it of items) {
    if (it.jenis !== 'tambah' || it.pertemuan_no == null) continue;
    if (!it.level) return 'Tahap pertemuan wajib dipilih untuk penambahan.';
    const no = it.pertemuan_no;
    if (!Number.isInteger(no) || no < 1 || no > 200) return `Nomor pertemuan ${no} tidak wajar.`;
    let used = perLevel.get(it.level);
    if (!used) {
      used = await pertemuanNoTerpakai(halaqahId, it.level);
      perLevel.set(it.level, used);
    }
    if (used.has(no)) return `Pertemuan ${no} sudah ada — pakai nomor lain, atau ubah tanggal pertemuan ${no} yang sudah ada.`;
    used.add(no); // cegah dua penambahan bernomor sama dalam satu pengajuan
  }
  return null;
}

/** Terapkan satu item koreksi yang DISETUJUI ke override/start_date. */
export async function applyKoreksiItem(
  halaqahId: string,
  item: { jenis: KoreksiJenis; level: string | null; pertemuan_no: number | null; tanggal: string | null },
  actor: { role: string; id: string }
): Promise<ApplyKoreksiResult> {
  if (item.jenis === 'set_mulai' && item.tanggal) {
    await supabaseAdmin.from('hits_halaqah').update({ start_date: item.tanggal }).eq('id', halaqahId);
    // Buang keterangan sesi yang kini terbuang (< start_date).
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).lt('tanggal', item.tanggal);
    return { ok: true };
  }
  if (item.jenis === 'hapus' && item.level && item.pertemuan_no != null) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal ?? '1970-01-01', is_skipped: true, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').delete().eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return { ok: true };
  }
  if (item.jenis === 'ubah_tanggal' && item.level && item.pertemuan_no != null && item.tanggal) {
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      { halaqah_id: halaqahId, level: item.level, pertemuan_no: item.pertemuan_no, tanggal: item.tanggal, is_skipped: false, set_by_role: actor.role, set_by_id: actor.id },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    await supabaseAdmin.from('hits_keterangan_harian').update({ tanggal: item.tanggal }).eq('halaqah_id', halaqahId).eq('level', item.level).eq('pertemuan_no', item.pertemuan_no);
    return { ok: true };
  }
  if (item.jenis === 'tambah' && item.level && item.tanggal) {
    let no: number;
    if (item.pertemuan_no != null) {
      // Ketua memilih nomornya sendiri (mis. mengisi kembali nomor yang tadinya
      // dihapus). Validasi ULANG di sini: daftar pertemuan bisa berubah antara
      // pengajuan dan Acc. Bentrok = gagalkan, JANGAN diam-diam pindah ke max+1.
      const used = await pertemuanNoTerpakai(halaqahId, item.level);
      if (used.has(item.pertemuan_no)) {
        return { ok: false, error: `Pertemuan ${item.pertemuan_no} sudah ada sekarang — penambahan ini tidak bisa diterapkan.` };
      }
      no = item.pertemuan_no;
    } else {
      // Tanpa nomor pilihan: append max+1 PER TAHAP. Max diambil dari pertemuan
      // terderivasi (kaldik) + override yang ada agar nomor di atas semua yang
      // sekarang & tak bentrok.
      const loaded = await loadHalaqahPertemuan(halaqahId);
      const derivedMax = Math.max(
        0,
        ...(loaded?.derived ?? []).filter((d) => d.level === item.level).map((d) => d.pertemuan_no)
      );
      const { data: ov } = await supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('pertemuan_no')
        .eq('halaqah_id', halaqahId)
        .eq('level', item.level);
      const ovMax = Math.max(0, ...(ov ?? []).map((r) => r.pertemuan_no));
      const used = new Set((ov ?? []).map((r) => r.pertemuan_no));
      no = Math.max(derivedMax, ovMax) + 1;
      while (used.has(no)) no++; // jaga unik bila ada beberapa tambah beruntun
    }
    // upsert (bukan insert): nomor bekas hapus masih punya baris override
    // is_skipped=true yang harus dihidupkan kembali, bukan bikin baris kedua.
    await supabaseAdmin.from('hits_kaldik_pertemuan').upsert(
      {
        halaqah_id: halaqahId, level: item.level, pertemuan_no: no, tanggal: item.tanggal, is_skipped: false,
        set_by_role: actor.role, set_by_id: actor.id, note: 'tambahan via koreksi ketua',
      },
      { onConflict: 'halaqah_id,level,pertemuan_no' }
    );
    // Keterangan lama yang masih menempel di nomor ini (sisa sesi yang dihapus)
    // akan ikut tampil di slot baru — dicocokkan per level+pertemuan_no, bukan
    // tanggal. Buang yang tanggalnya bukan tanggal sesi baru.
    await supabaseAdmin
      .from('hits_keterangan_harian')
      .delete()
      .eq('halaqah_id', halaqahId)
      .eq('level', item.level)
      .eq('pertemuan_no', no)
      .neq('tanggal', item.tanggal);
    return { ok: true };
  }
  return { ok: false, error: 'Item koreksi tidak lengkap.' };
}
