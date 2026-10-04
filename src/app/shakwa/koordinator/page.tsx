import Link from 'next/link';
import { requireOneOfRoles } from '@/lib/session';
import { getShakwaRekap, countShakwaBelumDitangani, type ShakwaItem } from '@/lib/shakwa-rekap';
import { signedLampiranUrls } from '@/lib/shakwa-storage';
import { daftarCalonBadal } from '@/lib/shakwa-badal';
import { KATEGORI } from '@/lib/shakwa';
import type { ShakwaKategori, ShakwaStatus } from '@/lib/shakwa';
import { buildWaMeUrl, tplShakwaBalasPelapor, tplShakwaRekapHarian } from '@/lib/whatsapp';
import { todayJakartaISO } from '@/lib/hits-observasi';
import { absUrl } from '@/lib/url';
import { SalinRekapButton } from './SalinRekapButton';
import { ShakwaCard } from './ShakwaCard';
import { FilterBar } from './FilterBar';
import { KategoriBadges } from './KategoriBadges';
import { BelumDitangani, Paginasi } from './Paginasi';
import type { ShakwaQuery } from './ui-helpers';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Dashboard aduan Shakwa + rekap harian untuk koordinator. */
export default async function ShakwaKoordinatorPage({
  searchParams,
}: {
  // `gender` sengaja tak ada di sini: nilainya datang dari sesi, dan
  // mencantumkannya menyiratkan URL masih bisa mengubahnya.
  searchParams: { tanggal?: string; dari?: string; sampai?: string; kategori?: string; status?: string; page?: string };
}) {
  const session = await requireOneOfRoles(['koordinator', 'koordinator_ketua_kelas']);

  const hariIni = todayJakartaISO();
  const tanggal = DATE_RE.test(searchParams.tanggal ?? '') ? (searchParams.tanggal as string) : hariIni;
  const dari = DATE_RE.test(searchParams.dari ?? '') ? (searchParams.dari as string) : undefined;
  const sampai = DATE_RE.test(searchParams.sampai ?? '') ? (searchParams.sampai as string) : undefined;
  const kategori = KATEGORI.some((k) => k.value === searchParams.kategori)
    ? (searchParams.kategori as ShakwaKategori)
    : undefined;
  const status = ['submitted', 'in_review', 'resolved', 'closed'].includes(searchParams.status ?? '')
    ? (searchParams.status as ShakwaStatus)
    : undefined;
  // Gender DIKUNCI ke gender koordinator, bukan diambil dari query-string.
  //
  // Sebelumnya nilainya hanya dibaca dari `?gender=` dan defaultnya undefined —
  // artinya "semua gender". Setiap koordinator shakwa karena itu melihat dan bisa
  // menindak aduan kedua gender; SKW-20260904-003 (pelapor ikhwan) berakhir
  // ditangani koordinator akhwat, padahal koordinator ikhwannya ada. Isi shakwa
  // memuat aduan pribadi, jadi kebocoran ini bukan sekadar salah antre.
  const gender: Gender = session.gender;
  const pageNum = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  const rentangPenuh = dari && sampai;
  const [rekap, jumlahBelum] = await Promise.all([
    getShakwaRekap({
      tanggal: rentangPenuh ? undefined : tanggal,
      dari,
      sampai,
      kategori,
      status,
      gender,
      page: pageNum,
    }),
    countShakwaBelumDitangani(gender),
  ]);

  // Daftar calon badal hanya dimuat bila halaman ini memuat izin BADAL.
  const adaBadal = rekap.items.some((i) => i.izin.some((z) => z.jenis === 'BADAL'));
  const calonBadal = adaBadal ? await daftarCalonBadal(gender) : [];

  // Query saat ini (nilai tervalidasi) — untuk tautan filter/paginasi komponen.
  const current: ShakwaQuery = {
    tanggal: rentangPenuh ? undefined : searchParams.tanggal ? tanggal : undefined,
    dari,
    sampai,
    kategori,
    status,
    // gender sengaja TIDAK diteruskan ke tautan filter: nilainya kini datang dari
    // sesi, jadi menuliskannya di URL cuma menyiratkan ia bisa diubah dari sana.
    page: pageNum > 1 ? String(pageNum) : undefined,
  };

  // Lampiran: URL bertanda tangan dibuat sesaat, hanya untuk item di halaman ini.
  const lampiranByItem = new Map<string, Array<{ path: string; url: string | null }>>();
  await Promise.all(
    rekap.items
      .filter((i) => i.lampiran.length)
      .map(async (i) => {
        lampiranByItem.set(i.id, await signedLampiranUrls(i.lampiran));
      })
  );

  const periodeLabel = rekap.mulai === rekap.sampai ? rekap.mulai : `${rekap.mulai} → ${rekap.sampai}`;
  const teksRekap = tplShakwaRekapHarian({
    tanggalLabel: periodeLabel,
    total: rekap.total,
    perKategori: rekap.perKategori.map((k) => ({ label: k.label, jumlah: k.jumlah })),
    belumDitangani: rekap.belumDitangani,
    dashboardUrl: absUrl('/shakwa/koordinator'),
  });

  const balasUrl = (i: ShakwaItem) =>
    i.pelapor_wa
      ? buildWaMeUrl(
          i.pelapor_wa,
          tplShakwaBalasPelapor({ nama: i.nama, nomorTiket: i.nomorTiket, kategoriLabel: i.kategoriLabel })
        )
      : null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">S</span> Shakwa
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <SalinRekapButton teks={teksRekap} />
            <Link
              href="/shakwa"
              className="btn btn-sm btn-ghost"
              style={{ height: 32, padding: '0 12px', textDecoration: 'none', border: '1px solid var(--line)' }}
            >
              Buka formulir
            </Link>
          </div>
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Rekap Shakwa
          </h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
            {periodeLabel} · {rekap.total} laporan · {rekap.belumDitangani} belum ditangani pada periode ini
          </p>

          <div style={{ marginBottom: 16 }}>
            <BelumDitangani jumlah={jumlahBelum} hariIni={hariIni} />
          </div>

          <FilterBar
            current={current}
            hariIni={hariIni}
            kategoriOptions={KATEGORI.map((k) => ({ value: k.value, label: k.label }))}
          />

          <KategoriBadges perKategori={rekap.perKategori} current={current} />

          {rekap.items.length === 0 ? (
            <div className="card-flat" style={{ padding: '32px 24px', textAlign: 'center' }}>
              <p className="t-h3" style={{ marginBottom: 4 }}>
                Tak ada laporan
              </p>
              <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
                Tidak ada aduan Shakwa pada periode &amp; penyaring ini.
              </p>
              <Link href="/shakwa/koordinator" className="btn btn-sm btn-ghost" style={{ border: '1px solid var(--line)' }}>
                Reset penyaring
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rekap.items.map((i) => (
                <ShakwaCard
                  key={i.id}
                  item={i}
                  lampiran={lampiranByItem.get(i.id) ?? []}
                  waUrl={balasUrl(i)}
                  calonBadal={calonBadal}
                />
              ))}
            </div>
          )}

          <Paginasi page={rekap.page} totalHalaman={rekap.totalHalaman} current={current} />
        </div>
      </div>
    </main>
  );
}
