// Logika bersama untuk route kirim setoran 2in1:
//   peserta → musyrif (tabel setoran/rekaman)
//     · /api/2in1/rekaman/submit-single          — satu rekaman per unggahan
//     · /api/2in1/setoran/submit                 — tiga rekaman sekaligus
//   musyrif → syaikh (tabel setoran_musyrif/rekaman_musyrif)
//     · /api/2in1/setoran-musyrif/submit-single  — satu rekaman per unggahan
//     · /api/2in1/setoran-musyrif/submit         — tiga rekaman sekaligus
//
// Aturan pokok (sama untuk kedua alur):
//   · Rekaman yang SUDAH DINILAI (nilai terisi) tidak boleh ditimpa
//     penyetor — nilai & masukannya dijaga utuh.
//   · Setoran yang sudah 'checked' tetapi masih kurang rekaman (penilai
//     menilai setoran yang belum lengkap) boleh menerima rekaman yang belum
//     ada; setoran lalu dibuka ulang ke 'submitted' supaya penilai menilai
//     rekaman susulan itu.
//   · week_start boleh dikirim klien (unggahan yang selesai lewat tengah
//     malam pergantian cycle tetap masuk cycle saat merekam), tapi harus awal
//     cycle yang sah dan tidak di masa depan.

import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { logAudit } from '@/lib/audit';
import { currentCycleStart, isValidCycleStart } from '@/lib/week';
import { buildWaMeUrl, syaikhTitle, tplMusyrifSubmitToSyaikh } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import type {
  Gender,
  JenisRekaman,
  MusyrifSession,
  NilaiRekaman,
  PesertaSession,
  RoleAccess,
  StatusSetoran,
} from '@/types/db';

/**
 * Pasangan tabel satu alur setoran. Nama tabel/kolom tetap (bukan masukan
 * pengguna), jadi aman dipakai langsung di query builder.
 */
interface TabelSetoran {
  setoran: string;
  rekaman: string;
  /** Kolom pemilik setoran di tabel setoran (peserta_id / musyrif_id). */
  kolomPemilik: string;
  /** FK rekaman → setoran. */
  kolomFk: string;
  /** Kolom jejak penilai di tabel setoran. */
  kolomPenilai: string;
}

const TABEL_PESERTA: TabelSetoran = {
  setoran: 'setoran',
  rekaman: 'rekaman',
  kolomPemilik: 'peserta_id',
  kolomFk: 'setoran_id',
  kolomPenilai: 'checked_by_musyrif_id',
};

const TABEL_MUSYRIF: TabelSetoran = {
  setoran: 'setoran_musyrif',
  rekaman: 'rekaman_musyrif',
  kolomPemilik: 'musyrif_id',
  kolomFk: 'setoran_musyrif_id',
  kolomPenilai: 'checked_by_syaikh_id',
};

/** Akses peserta dari sesi — lewat `accesses` dulu supaya akun multi-peran tidak ditolak. */
export function aksesPeserta(s: { session?: RoleAccess; accesses?: RoleAccess[] }): PesertaSession | null {
  const dariAkses = s.accesses?.find((a) => a.role === 'peserta') as PesertaSession | undefined;
  if (dariAkses) return dariAkses;
  if (s.session?.role === 'peserta') return s.session as PesertaSession;
  return null;
}

/** Akses musyrif dari sesi — lewat `accesses` dulu supaya akun multi-peran tidak ditolak. */
export function aksesMusyrif(s: { session?: RoleAccess; accesses?: RoleAccess[] }): MusyrifSession | null {
  const dariAkses = s.accesses?.find((a) => a.role === 'musyrif') as MusyrifSession | undefined;
  if (dariAkses) return dariAkses;
  if (s.session?.role === 'musyrif') return s.session as MusyrifSession;
  return null;
}

/**
 * Baca `week_start` dari form. Kosong/absen → cycle berjalan (fallback server).
 * Diisi → harus awal cycle yang sah, tidak sebelum anchor, tidak di masa depan.
 */
export function bacaWeekStart(
  form: FormData
): { ok: true; weekStart: string } | { ok: false; error: string } {
  const raw = form.get('week_start');
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return { ok: true, weekStart: currentCycleStart() };
  if (!isValidCycleStart(v)) {
    return {
      ok: false,
      error: 'Periode setoran tidak valid (bukan awal periode, atau periode yang belum dimulai). Muat ulang halaman lalu kirim lagi.',
    };
  }
  return { ok: true, weekStart: v };
}

export interface RekamanAda {
  nilai: NilaiRekaman | null;
  audio_url: string | null;
}

export interface KeadaanSetoran {
  setoran: {
    id: string;
    status: StatusSetoran;
    checked_at: string | null;
    checked_by_musyrif_id: string | null;
  } | null;
  rekaman: Map<JenisRekaman, RekamanAda>;
}

/** Keadaan setoran musyrif → syaikh (tabel setoran_musyrif/rekaman_musyrif). */
export interface KeadaanSetoranMusyrif {
  setoran: {
    id: string;
    status: StatusSetoran;
    checked_at: string | null;
    checked_by_syaikh_id: string | null;
  } | null;
  rekaman: Map<JenisRekaman, RekamanAda>;
}

type SetoranUmum = { id: string; status: StatusSetoran; checked_at: string | null; penilai: string | null };

async function muatKeadaanUmum(
  t: TabelSetoran,
  pemilikId: string,
  weekStart: string
): Promise<
  | { ok: true; setoran: SetoranUmum | null; rekaman: Map<JenisRekaman, RekamanAda> }
  | { ok: false; error: string }
> {
  const { data: setoran, error: sErr } = await supabaseAdmin
    .from(t.setoran)
    .select(`id, status, checked_at, ${t.kolomPenilai}`)
    .eq(t.kolomPemilik, pemilikId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (sErr) return { ok: false, error: `Gagal membaca setoran: ${sErr.message}` };

  const rekaman = new Map<JenisRekaman, RekamanAda>();
  if (setoran) {
    const { data: rows, error: rErr } = await supabaseAdmin
      .from(t.rekaman)
      .select('jenis, nilai, audio_url')
      .eq(t.kolomFk, setoran.id);
    if (rErr) return { ok: false, error: `Gagal membaca rekaman: ${rErr.message}` };
    for (const r of (rows ?? []) as Array<{ jenis: JenisRekaman; nilai: NilaiRekaman | null; audio_url: string | null }>) {
      rekaman.set(r.jenis, { nilai: r.nilai, audio_url: r.audio_url });
    }
  }
  const baris = setoran as Record<string, unknown> | null;
  return {
    ok: true,
    setoran: baris
      ? {
          id: baris.id as string,
          status: baris.status as StatusSetoran,
          checked_at: (baris.checked_at as string | null) ?? null,
          penilai: (baris[t.kolomPenilai] as string | null) ?? null,
        }
      : null,
    rekaman,
  };
}

export async function muatKeadaanSetoran(
  pesertaId: string,
  weekStart: string
): Promise<{ ok: true; data: KeadaanSetoran } | { ok: false; error: string }> {
  const k = await muatKeadaanUmum(TABEL_PESERTA, pesertaId, weekStart);
  if (!k.ok) return k;
  return {
    ok: true,
    data: {
      setoran: k.setoran
        ? {
            id: k.setoran.id,
            status: k.setoran.status,
            checked_at: k.setoran.checked_at,
            checked_by_musyrif_id: k.setoran.penilai,
          }
        : null,
      rekaman: k.rekaman,
    },
  };
}

export async function muatKeadaanSetoranMusyrif(
  musyrifId: string,
  weekStart: string
): Promise<{ ok: true; data: KeadaanSetoranMusyrif } | { ok: false; error: string }> {
  const k = await muatKeadaanUmum(TABEL_MUSYRIF, musyrifId, weekStart);
  if (!k.ok) return k;
  return {
    ok: true,
    data: {
      setoran: k.setoran
        ? {
            id: k.setoran.id,
            status: k.setoran.status,
            checked_at: k.setoran.checked_at,
            checked_by_syaikh_id: k.setoran.penilai,
          }
        : null,
      rekaman: k.rekaman,
    },
  };
}

export function sudahDinilai(r: RekamanAda | undefined): boolean {
  return !!r && r.nilai !== null;
}

/** Ambil id setoran; buat baris 'draft' bila belum ada (tahan balapan insert ganda). */
export function pastikanSetoran(
  pesertaId: string,
  weekStart: string,
  ada: KeadaanSetoran['setoran']
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return pastikanSetoranUmum(TABEL_PESERTA, pesertaId, weekStart, ada);
}

export function pastikanSetoranMusyrif(
  musyrifId: string,
  weekStart: string,
  ada: KeadaanSetoranMusyrif['setoran']
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  return pastikanSetoranUmum(TABEL_MUSYRIF, musyrifId, weekStart, ada);
}

async function pastikanSetoranUmum(
  t: TabelSetoran,
  pemilikId: string,
  weekStart: string,
  ada: { id: string } | null
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (ada) return { ok: true, id: ada.id };
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from(t.setoran)
    .insert({ [t.kolomPemilik]: pemilikId, week_start: weekStart, status: 'draft' })
    .select('id')
    .single();
  if (inserted && !insErr) return { ok: true, id: inserted.id as string };

  // Dua unggahan paralel bisa sama-sama mencoba membuat setoran — yang kalah
  // cukup memakai baris yang sudah dibuat pemenangnya.
  if (insErr?.code === '23505') {
    const { data: lain, error: selErr } = await supabaseAdmin
      .from(t.setoran)
      .select('id')
      .eq(t.kolomPemilik, pemilikId)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (lain && !selErr) return { ok: true, id: lain.id as string };
  }
  return { ok: false, error: `Gagal membuat setoran: ${insErr?.message ?? 'tidak diketahui'}` };
}

/**
 * Simpan satu rekaman. Baris yang sudah ada hanya diperbarui bila BELUM
 * dinilai (`nilai is null`) — kalau musyrif keburu menilai di antara
 * pemeriksaan dan penulisan, hasilnya 409, bukan menimpa nilai.
 */
type ArgsSimpan = {
  setoranId: string;
  jenis: JenisRekaman;
  path: string;
  durationSec: number | null;
  recordedAt: string;
  adaBaris: boolean;
};
type HasilSimpan = { ok: true } | { ok: false; status: number; error: string };

export function simpanRekaman(args: ArgsSimpan): Promise<HasilSimpan> {
  return simpanRekamanUmum(TABEL_PESERTA, args, 'Rekaman ini sudah dinilai musyrif, tidak bisa diganti.');
}

export function simpanRekamanMusyrif(args: ArgsSimpan): Promise<HasilSimpan> {
  return simpanRekamanUmum(TABEL_MUSYRIF, args, 'Rekaman ini sudah dinilai, tidak bisa diganti.');
}

async function simpanRekamanUmum(t: TabelSetoran, args: ArgsSimpan, pesan409: string): Promise<HasilSimpan> {
  const isi = {
    audio_url: args.path,
    duration_seconds: args.durationSec,
    recorded_at: args.recordedAt,
    nilai: null,
    masukan: null,
    checked_at: null,
  };
  const perbarui = async (): Promise<HasilSimpan> => {
    const { data, error } = await supabaseAdmin
      .from(t.rekaman)
      .update(isi)
      .eq(t.kolomFk, args.setoranId)
      .eq('jenis', args.jenis)
      .is('nilai', null)
      .select('id');
    if (error) return { ok: false, status: 500, error: `Gagal menyimpan rekaman: ${error.message}` };
    if (!data || data.length === 0) {
      return { ok: false, status: 409, error: pesan409 };
    }
    return { ok: true };
  };

  if (args.adaBaris) return perbarui();

  const { error } = await supabaseAdmin
    .from(t.rekaman)
    .insert({ [t.kolomFk]: args.setoranId, jenis: args.jenis, ...isi });
  if (!error) return { ok: true };
  // Unggahan ganda (mis. klien mengulang kiriman yang ternyata sudah masuk):
  // barisnya kini ada — perbarui saja, tetap dengan syarat belum dinilai.
  if (error.code === '23505') return perbarui();
  return { ok: false, status: 500, error: `Gagal menyimpan rekaman: ${error.message}` };
}

/**
 * Tandai setoran 'submitted'. Dari 'checked' (buka ulang karena rekaman
 * susulan) jejak cek lama dikosongkan — trigger mengisinya lagi saat musyrif
 * menilai ulang; nilai rekaman lama tidak disentuh.
 */
export function tandaiTerkirim(
  setoranId: string,
  statusLama: StatusSetoran | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  return tandaiTerkirimUmum(TABEL_PESERTA, setoranId, statusLama);
}

export function tandaiTerkirimMusyrif(
  setoranId: string,
  statusLama: StatusSetoran | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  return tandaiTerkirimUmum(TABEL_MUSYRIF, setoranId, statusLama);
}

async function tandaiTerkirimUmum(
  t: TabelSetoran,
  setoranId: string,
  statusLama: StatusSetoran | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (statusLama === 'submitted') return { ok: true };
  const patch: Record<string, unknown> = { status: 'submitted' };
  if (statusLama === 'checked') {
    patch.checked_at = null;
    patch[t.kolomPenilai] = null;
  }
  const { data, error } = await supabaseAdmin.from(t.setoran).update(patch).eq('id', setoranId).select('id');
  if (error) return { ok: false, error: `Gagal memperbarui status setoran: ${error.message}` };
  if (!data || data.length === 0) {
    return { ok: false, error: 'Setoran tidak ditemukan saat memperbarui status. Muat ulang halaman lalu kirim lagi.' };
  }
  return { ok: true };
}

/** Catat ke audit_log tanpa menunggu dan tanpa pernah melempar. */
export function catatAudit(
  actor: RoleAccess,
  action: string,
  targetId: string | null,
  detail: Record<string, unknown>,
  targetTable = 'setoran'
): void {
  void logAudit({ actor, action, targetTable, targetId, detail }).catch((e) => {
    console.error('catatAudit gagal', { action, e });
  });
}

/** Balasan JSON galat + catatan audit kegagalan kirim. */
export function balasGagal(
  actor: RoleAccess,
  route: string,
  status: number,
  error: string,
  detail: Record<string, unknown> = {},
  targetId: string | null = null,
  targetTable = 'setoran'
): NextResponse {
  catatAudit(actor, 'setoran.kirim_gagal', targetId, { route, status, error, ...detail }, targetTable);
  return NextResponse.json({ error, ...(detail.kode ? { kode: detail.kode } : {}) }, { status });
}

// ---------------------------------------------------------------------------
// Khusus alur musyrif → syaikh
// ---------------------------------------------------------------------------

export type SyaikhPenerima = { id: string; name: string; gender: Gender; whatsapp_number: string };

/**
 * Syaikh/Ustadzah aktif penerima setoran untuk gender musyrif ini.
 * `titelKecil` ("syaikh"/"ustadzah") untuk dipakai di tengah kalimat pesan galat.
 */
export async function syaikhPenerima(
  gender: Gender
): Promise<
  | { ok: true; data: SyaikhPenerima; titelKecil: string }
  | { ok: false; status: number; error: string }
> {
  const { data, error } = await supabaseAdmin
    .from('syaikh')
    .select('id, name, gender, whatsapp_number')
    .eq('gender', gender)
    .eq('active', true)
    .order('penerima_utama', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: `Gagal membaca data Syaikh/Ustadzah: ${error.message}` };
  if (!data) return { ok: false, status: 404, error: 'Belum ada Syaikh/Ustadzah aktif untuk gender Anda.' };
  const syaikh = data as SyaikhPenerima;
  return { ok: true, data: syaikh, titelKecil: syaikhTitle(syaikh.gender).toLowerCase() };
}

/** Tautan wa.me pemberitahuan setoran musyrif ke syaikh penerima. */
export function waKeSyaikh(actor: MusyrifSession, syaikh: SyaikhPenerima, setoranId: string): string {
  const waText = tplMusyrifSubmitToSyaikh({
    musyrifName: actor.name,
    musyrifGender: actor.gender,
    syaikhGender: syaikh.gender,
    cekUrl: absUrl(`/2in1/syaikh/cek/${setoranId}`),
  });
  return buildWaMeUrl(syaikh.whatsapp_number, waText);
}
