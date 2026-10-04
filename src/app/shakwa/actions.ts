'use server';

import { headers } from 'next/headers';
import { labelProgramHalaqah } from '@/lib/shakwa-program';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAllAccesses } from '@/lib/session';
import { logAudit } from '@/lib/audit';
import { todayJakartaISO } from '@/lib/hits-observasi';
import { checkRateLimit } from '@/lib/api-public/cache';
import { buildWaMeUrl, tplKabariBadal, tplShakwaKeTujuan } from '@/lib/whatsapp';
import {
  kategoriDef,
  nomorTiket,
  tujuanWa,
  tujuanDigilir,
  kategoriSetujuan,
  IZIN_JENIS,
  IZIN_JENIS_LABEL,
  MAX_LAMPIRAN,
  type ShakwaIzinJenis,
  type ShakwaTujuan,
} from '@/lib/shakwa';
import { uploadLampiran, validasiLampiran } from '@/lib/shakwa-storage';
import { adalahBerkas } from '@/lib/haqibah-storage';
import { backfillTabayyunDariIzin, type IzinCocok } from '@/lib/shakwa-izin';
import { ambilCalonBadal, cekBadal } from '@/lib/shakwa-badal';
import type { Gender, PengajarSession } from '@/types/db';

export type KirimShakwaResult = {
  ok?: boolean;
  error?: string;
  nomorTiket?: string;
  waUrl?: string | null;
  tujuanNama?: string | null;
  /** Satu link wa.me per badal untuk dikabari pengajar sendiri. */
  badalWa?: Array<{ nama: string; url: string }>;
};

/** Maks kiriman per menit per IP — penangkal spam formulir publik. */
const PER_MENIT_PER_IP = 3;

function ipPemanggil(): string {
  const h = headers();
  const fwd = h.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || h.get('x-real-ip') || 'tanpa-ip';
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type IzinRincian = {
  tanggal: string;
  jenis: ShakwaIzinJenis;
  menit: number | null;
  jadwalGanti: string | null;
  halaqahId: string | null;
  /** Diisi hanya untuk jenis yang butuhBadal; divalidasi cekBadal sesudahnya. */
  badalId: string | null;
};

/** Baca baris rincian izin dari FormData (array sejajar per indeks). */
function bacaRincianIzin(fd: FormData): { rows: IzinRincian[]; error?: string } {
  const tanggal = fd.getAll('izin_tanggal').map(String);
  const jenis = fd.getAll('izin_jenis').map(String);
  const menit = fd.getAll('izin_menit').map(String);
  const ganti = fd.getAll('izin_jadwal_ganti').map(String);
  const halaqah = fd.getAll('izin_halaqah').map(String);
  const badal = fd.getAll('izin_badal').map(String);
  const jenisValid = new Set(IZIN_JENIS.map((j) => j.value));
  const rows: IzinRincian[] = [];

  for (let i = 0; i < tanggal.length; i++) {
    const t = tanggal[i]?.trim();
    const j = jenis[i]?.trim();
    if (!t && !j) continue; // baris kosong — pengguna menambah lalu membiarkannya
    if (!DATE_RE.test(t ?? '')) return { rows: [], error: `Rincian ke-${i + 1}: tanggal wajib diisi.` };
    if (!jenisValid.has(j as ShakwaIzinJenis)) {
      return { rows: [], error: `Rincian ke-${i + 1}: jenis izin tidak dikenal.` };
    }
    const def = IZIN_JENIS.find((x) => x.value === j)!;
    let m: number | null = null;
    if (def.butuhMenit) {
      const n = Number(menit[i] ?? '');
      if (!Number.isFinite(n) || n < 0) {
        return { rows: [], error: `Rincian ke-${i + 1}: ${IZIN_JENIS_LABEL[def.value]} butuh jumlah menit.` };
      }
      m = Math.trunc(n);
    }
    const g = (ganti[i] ?? '').trim();
    if (g && !DATE_RE.test(g)) {
      return { rows: [], error: `Rincian ke-${i + 1}: tanggal ganti tidak valid.` };
    }
    let badalId: string | null = null;
    if (def.butuhBadal) {
      badalId = (badal[i] ?? '').trim() || null;
      if (!badalId) return { rows: [], error: `Rincian ke-${i + 1}: pilih pengajar badal.` };
    }
    rows.push({
      tanggal: t,
      jenis: j as ShakwaIzinJenis,
      menit: m,
      jadwalGanti: g || null,
      halaqahId: (halaqah[i] ?? '').trim() || null,
      badalId,
    });
  }
  return { rows };
}

/**
 * Nomor tiket berurutan per hari. Tabrakan antar-pengirim serempak ditangani
 * dengan mencoba ulang, bukan dengan penguncian — kiriman formulir jarang cukup
 * padat untuk membuat ini mahal.
 */
async function simpanDenganTiket(
  baris: Record<string, unknown>,
  tanggal: string
): Promise<{ id: string; nomorTiket: string } | { error: string }> {
  for (let coba = 0; coba < 5; coba++) {
    const { count } = await supabaseAdmin
      .from('shakwa')
      .select('id', { count: 'exact', head: true })
      // Batas hari WIB — nomor tiket mengikuti tanggal setempat, bukan UTC.
      .gte('created_at', `${tanggal}T00:00:00+07:00`)
      .lte('created_at', `${tanggal}T23:59:59.999+07:00`);
    const tiket = nomorTiket(tanggal, (count ?? 0) + 1 + coba);
    const { data, error } = await supabaseAdmin
      .from('shakwa')
      .insert({ ...baris, nomor_tiket: tiket })
      .select('id')
      .single();
    if (!error && data) return { id: data.id as string, nomorTiket: tiket };
    if (error && !/duplicate|unique/i.test(error.message)) {
      return { error: `Gagal menyimpan: ${error.message}` };
    }
  }
  return { error: 'Gagal membuat nomor tiket. Coba lagi sebentar lagi.' };
}

/**
 * Nomor giliran untuk tujuan yang dipegang beberapa koordinator: jumlah laporan
 * sejenis (kategori yang berbagi tujuan itu, gender sama) yang sudah tersimpan.
 * Baris yang baru saja disimpan ikut terhitung, jadi laporan pertama → indeks 1.
 * Tujuan berpemegang tunggal tak perlu query sama sekali.
 */
async function urutanGiliran(tujuan: ShakwaTujuan, gender: Gender): Promise<number> {
  if (!tujuanDigilir(tujuan, gender)) return 0;
  const { count, error } = await supabaseAdmin
    .from('shakwa')
    .select('id', { count: 'exact', head: true })
    .eq('gender', gender)
    .in('kategori', kategoriSetujuan(tujuan));
  // Gagal hitung bukan alasan menggagalkan kiriman — jatuh ke pemegang pertama.
  if (error) {
    console.error('shakwa: gagal hitung giliran tujuan', error);
    return 0;
  }
  return count ?? 0;
}

export async function kirimShakwa(
  _prev: KirimShakwaResult | undefined,
  fd: FormData
): Promise<KirimShakwaResult> {
  // Honeypot: hanya bot yang mengisi field tersembunyi ini.
  if (String(fd.get('alamat') ?? '').trim()) return { ok: true, nomorTiket: 'SKW-0', waUrl: null };

  if (!checkRateLimit(`shakwa:${ipPemanggil()}`, PER_MENIT_PER_IP)) {
    return { error: 'Terlalu banyak kiriman dalam sekejap. Mohon tunggu sebentar.' };
  }

  const def = kategoriDef(String(fd.get('kategori') ?? ''));
  if (!def) return { error: 'Kategori laporan wajib dipilih.' };

  const gender = String(fd.get('gender') ?? '');
  if (gender !== 'ikhwan' && gender !== 'akhwat') return { error: 'Gender wajib dipilih.' };

  const nama = String(fd.get('nama') ?? '').trim();
  if (!nama) return { error: 'Nama lengkap wajib diisi.' };

  // Program & halaqah dipilih dari data nyata; server memvalidasi keduanya dan
  // menyusun label yang disimpan ("Program · Halaqah").
  const pilihan = await labelProgramHalaqah(
    String(fd.get('program_id') ?? '').trim(),
    String(fd.get('halaqah_id') ?? '').trim()
  );
  if ('error' in pilihan) return { error: pilihan.error };
  const halaqahLabel = pilihan.label;

  const isi = String(fd.get('isi') ?? '').trim();
  if (!isi) return { error: 'Isi laporan wajib diisi.' };

  const pelaporWa = String(fd.get('pelapor_wa') ?? '').trim() || null;

  // Kategori yang menyangkut diri pengajar diverifikasi ulang di server —
  // field tersembunyi di formulir tak boleh jadi dasar identitas.
  let pengajar: PengajarSession | null = null;
  if (def.butuhLogin) {
    const accesses = await getAllAccesses();
    pengajar = (accesses.find((a) => a.role === 'pengajar') as PengajarSession | undefined) ?? null;
    if (!pengajar) {
      return { error: `Kategori ${def.label} hanya bisa dikirim setelah masuk sebagai pengajar.` };
    }
  }

  const jawaban: Record<string, string> = {};
  for (const f of def.fieldTambahan) {
    const v = String(fd.get(`tambahan_${f.name}`) ?? '').trim();
    if (!v) return { error: `${f.label} wajib dijawab.` };
    if (!f.opsi.includes(v)) return { error: `Jawaban "${f.label}" tidak dikenal.` };
    jawaban[f.name] = v;
  }

  let rincianIzin: IzinRincian[] = [];
  if (def.value === 'izin') {
    const parsed = bacaRincianIzin(fd);
    if (parsed.error) return { error: parsed.error };
    if (!parsed.rows.length) {
      return { error: 'Isi minimal satu rincian izin (tanggal + jenis) agar tak perlu tabayyun lagi.' };
    }
    rincianIzin = parsed.rows;
  }

  // Badal divalidasi di server: id dari form bisa apa saja. Gender pembanding
  // diambil dari sesi pengajar, bukan dari field `gender` formulir.
  const calonBadal = await ambilCalonBadal(
    rincianIzin.map((r) => r.badalId).filter((x): x is string => !!x)
  );
  for (let i = 0; i < rincianIzin.length; i++) {
    const id = rincianIzin[i].badalId;
    if (!id || !pengajar) continue;
    const alasanTolak = cekBadal(calonBadal.get(id) ?? null, {
      id: pengajar.pengajar_id,
      gender: pengajar.gender,
    });
    if (alasanTolak) return { error: `Rincian ke-${i + 1}: ${alasanTolak}` };
  }
  const namaBadal = (id: string | null) => (id ? (calonBadal.get(id)?.name ?? null) : null);

  // Lampiran divalidasi SEBELUM baris disimpan supaya tak ada aduan setengah jadi.
  // `adalahBerkas` memeriksa bentuk, bukan `instanceof File`: global File tak ada
  // di runtime Node produksi, dan ekspresi `f instanceof File` di sana melempar
  // ReferenceError begitu ada berkas yang benar-benar dilampirkan.
  const berkas = def.pakaiLampiran
    ? fd.getAll('lampiran').filter((f): f is File => adalahBerkas(f) && f.size > 0)
    : [];
  if (berkas.length > MAX_LAMPIRAN) return { error: `Maksimal ${MAX_LAMPIRAN} lampiran.` };
  for (const f of berkas) {
    const err = validasiLampiran(f);
    if (err) return { error: err };
  }

  const hariIni = todayJakartaISO();
  const simpan = await simpanDenganTiket(
    {
      pelapor_type: pengajar ? 'pengajar' : 'peserta',
      kategori: def.value,
      gender: gender as Gender,
      nama,
      pelapor_wa: pelaporWa,
      halaqoh: halaqahLabel,
      pengajar_id: pengajar?.pengajar_id ?? null,
      isi,
      jawaban,
      lampiran: [],
    },
    hariIni
  );
  if ('error' in simpan) return { error: simpan.error };

  if (berkas.length) {
    const paths: string[] = [];
    for (let i = 0; i < berkas.length; i++) {
      try {
        paths.push(await uploadLampiran({ shakwaId: simpan.id, index: i, file: berkas[i] }));
      } catch (e) {
        console.error('shakwa: gagal unggah lampiran', e);
      }
    }
    if (paths.length) {
      await supabaseAdmin.from('shakwa').update({ lampiran: paths }).eq('id', simpan.id);
    }
  }

  if (rincianIzin.length && pengajar) {
    const { data: izinRows, error: izinErr } = await supabaseAdmin
      .from('shakwa_izin')
      .insert(
        rincianIzin.map((r) => ({
          shakwa_id: simpan.id,
          pengajar_id: pengajar!.pengajar_id,
          halaqah_id: r.halaqahId,
          tanggal: r.tanggal,
          jenis: r.jenis,
          menit: r.menit,
          jadwal_ganti: r.jadwalGanti,
          badal_pengajar_id: r.badalId,
          alasan: isi,
        }))
      )
      .select('id');
    if (izinErr) console.error('shakwa: gagal simpan rincian izin', izinErr);

    // Reverse-link: bila ketua kelas sudah terlanjur mengisi observasi hari itu,
    // tabayyun 'pending' yang cocok langsung diisi alasannya dari izin ini.
    const ids = (izinRows ?? []) as Array<{ id: string }>;
    const dikirimAt = new Date().toISOString();
    for (let i = 0; i < rincianIzin.length; i++) {
      const idRow = ids[i];
      if (!idRow) continue;
      const r = rincianIzin[i];
      const izin: IzinCocok = {
        id: idRow.id,
        shakwaId: simpan.id,
        nomorTiket: simpan.nomorTiket,
        tanggal: r.tanggal,
        jenis: r.jenis,
        menit: r.menit,
        jadwalGanti: r.jadwalGanti,
        alasan: isi,
        dikirimAt,
        pengajarId: pengajar!.pengajar_id,
        halaqahId: r.halaqahId,
        badalNama: namaBadal(r.badalId),
      };
      try {
        await backfillTabayyunDariIzin(izin);
      } catch (e) {
        console.error('shakwa: gagal reverse-link izin', e);
      }
    }
  }

  if (pengajar) {
    await logAudit({
      actor: pengajar,
      action: 'shakwa.kirim',
      targetTable: 'shakwa',
      targetId: simpan.id,
      detail: { kategori: def.value, nomor_tiket: simpan.nomorTiket },
    });
  }

  const giliran = def.waTujuan ? await urutanGiliran(def.waTujuan, gender as Gender) : 0;
  const tujuan = def.waTujuan ? tujuanWa(def.waTujuan, gender as Gender, giliran) : null;
  const waUrl = tujuan
    ? buildWaMeUrl(
        tujuan.nomor,
        tplShakwaKeTujuan({
          nomorTiket: simpan.nomorTiket,
          kategoriLabel: def.label,
          nama,
          halaqahLabel,
          isi,
          rincian: rincianIzin.map((r) => {
            const menitTxt =
              r.menit == null
                ? null
                : r.jenis === 'KMT'
                  ? `telat ${r.menit} menit`
                  : r.jenis === 'KBLA'
                    ? `berakhir ${r.menit} menit lebih awal`
                    : `${r.menit} menit`;
            const gantiTxt = r.jadwalGanti ? `ganti ke ${r.jadwalGanti}` : null;
            const badalTxt = r.badalId ? `badal ${namaBadal(r.badalId)}` : null;
            return [r.tanggal, IZIN_JENIS_LABEL[r.jenis], menitTxt, gantiTxt, badalTxt]
              .filter(Boolean)
              .join(' · ');
          }
          ),
        })
      )
    : null;

  const namaHalaqah = new Map<string, string>();
  const halaqahIds = rincianIzin.filter((r) => r.badalId && r.halaqahId).map((r) => r.halaqahId!);
  if (halaqahIds.length) {
    const { data } = await supabaseAdmin.from('hits_halaqah').select('id, name').in('id', halaqahIds);
    for (const h of (data ?? []) as Array<{ id: string; name: string }>) namaHalaqah.set(h.id, h.name);
  }
  const badalWa = rincianIzin.flatMap((r) => {
    const b = r.badalId ? calonBadal.get(r.badalId) : null;
    if (!b || !pengajar) return [];
    return [
      {
        nama: b.name,
        url: buildWaMeUrl(
          b.whatsapp_number,
          tplKabariBadal({
            namaBadal: b.name,
            namaPengajar: pengajar.name,
            gender: pengajar.gender,
            tanggal: r.tanggal,
            halaqahNama: r.halaqahId ? (namaHalaqah.get(r.halaqahId) ?? null) : null,
            nomorTiket: simpan.nomorTiket,
          })
        ),
      },
    ];
  });

  return {
    ok: true,
    nomorTiket: simpan.nomorTiket,
    waUrl,
    tujuanNama: tujuan?.nama ?? null,
    badalWa,
  };
}
