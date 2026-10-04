import Link from 'next/link';
import type { KsPeriode } from '@/types/db';
import { DAFTAR_TAB, tautanDasbor, type SaringGender, type TabDasbor } from './navigasi';

const tanggalPanjang = (t: string) =>
  new Date(`${t}T00:00:00Z`).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

const LABEL_GENDER: Record<SaringGender, string> = { semua: 'Semua', ikhwan: 'Ikhwan', akhwat: 'Akhwat' };

/** Nilai `?periode=` untuk pandangan gabungan semua tahap aktif. */
export const PERIODE_GABUNGAN = 'gabungan';

export function KepalaDasbor({
  periode,
  aktif,
  gabungan = false,
  tab,
  g,
  hitungan,
}: {
  periode: readonly KsPeriode[];
  /** Periode terpilih; pada pandangan gabungan diisi tahap pertama (sumber aturan kapasitas). */
  aktif: KsPeriode;
  gabungan?: boolean;
  tab: TabDasbor;
  g: SaringGender;
  /** Lencana merah di tab: jumlah hal yang menunggu tindakan. */
  hitungan: Partial<Record<TabDasbor, number>>;
}) {
  return (
    <>
      <nav className="ks-periode" aria-label="Pilih periode">
        {periode.filter((p) => p.aktif).length >= 2 && (
          <Link
            href={tautanDasbor({ periode: PERIODE_GABUNGAN, tab: tab === 'jam' ? 'jam' : 'ringkasan', g })}
            className="ks-periode-kartu"
            aria-current={gabungan ? 'true' : undefined}
          >
            <span className="nm">Gabungan semua tahap</span>
            <span className="meta">
              <span>Pendaftar yang sama, pengajar {periode.filter((p) => p.aktif).length} tahap</span>
            </span>
          </Link>
        )}
        {periode.map((p) => (
          <Link
            key={p.id}
            href={tautanDasbor({ periode: p.id, tab, g })}
            className="ks-periode-kartu"
            aria-current={!gabungan && p.id === aktif.id ? 'true' : undefined}
          >
            <span className="nm">{p.nama}</span>
            <span className="meta">
              <span>KBM mulai {tanggalPanjang(p.mulai)}</span>
              {!p.aktif && <span className="badge badge-neutral">nonaktif</span>}
              {p.kirim_nyata && (
                <span className="badge badge-merah">
                  <span className="dot" />
                  kirim nyata
                </span>
              )}
            </span>
          </Link>
        ))}
      </nav>

      <div className="ks-kontrol">
        <nav className="ks-seg" aria-label="Saring gender">
          {(['semua', 'ikhwan', 'akhwat'] as const).map((x) => (
            <Link
              key={x}
              href={tautanDasbor({ periode: gabungan ? PERIODE_GABUNGAN : aktif.id, tab, g: x })}
              aria-current={x === g ? 'true' : undefined}
            >
              {LABEL_GENDER[x]}
            </Link>
          ))}
        </nav>
        <span className="t-small" style={{ color: 'var(--ink-2)' }}>
          Kapasitas {aktif.kapasitas_halaqah} per halaqah · sisa kelompok umur boleh digabung setelah antrean{' '}
          {aktif.usia_antrean_maks_hari} hari
        </span>
      </div>

      <nav className="ks-tab" aria-label="Bagian dashboard">
        {DAFTAR_TAB.filter((t) => !gabungan || t.kunci === 'ringkasan' || t.kunci === 'jam').map((t) => (
          <Link
            key={t.kunci}
            href={tautanDasbor({ periode: gabungan ? PERIODE_GABUNGAN : aktif.id, tab: t.kunci, g })}
            aria-current={t.kunci === tab ? 'page' : undefined}
          >
            {t.label}
            {(hitungan[t.kunci] ?? 0) > 0 && <span className="n">{hitungan[t.kunci]}</span>}
          </Link>
        ))}
      </nav>
    </>
  );
}
