import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { getSPDetail } from '@/lib/maahir-sp';
import { Icon } from '@/components/icons';
import { SPDetailClient, type RiwayatRow, type SesiOpt } from './SPDetailClient';

export const dynamic = 'force-dynamic';

function tanggalPanjang(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function bulanPanjang(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Jam WIB dari timestamp — supaya perubahan bisa dilacak sampai menitnya. */
function waktuWib(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

export default async function SPDetailPage({ params }: { params: { anggotaId: string } }) {
  const { accesses } = await getSession();
  if (!accesses?.some((a) => a.role === 'koordinator' || a.role === 'koordinator_kehadiran')) {
    redirect('/2in1/koordinator/login');
  }

  const detail = await getSPDetail(params.anggotaId);
  if (!detail) notFound();

  const sesi: SesiOpt[] = detail.sesi.map((s) => ({
    key: `${s.anggotaId}|${s.tanggal}`,
    tanggal: s.tanggal,
    label: tanggalPanjang(s.tanggal),
    kelasName: s.kelasName,
    status: s.status,
    sudahDiputihkan: s.pemutihan
      ? s.pemutihan.tanggal === null
        ? `sebulan penuh (${bulanPanjang(s.pemutihan.month)})`
        : (s.pemutihan.alasan ?? 'tanpa alasan')
      : null,
  }));

  const riwayat: RiwayatRow[] = detail.riwayat.map((r) => ({
    id: r.id,
    label: r.tanggal ? tanggalPanjang(r.tanggal) : `${bulanPanjang(r.month)} (sebulan)`,
    alasan: r.alasan,
    oleh: r.oleh,
    pada: waktuWib(r.pada),
    dibatalkan: r.dibatalkanPada
      ? { oleh: r.dibatalkanOleh, pada: waktuWib(r.dibatalkanPada) }
      : null,
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Rincian SP</div>
            <Link href="/2in1/koordinator/kehadiran/sp" className="back">
              {Icon.back(12)} Pendataan SP
            </Link>
          </div>

          <div style={{ marginBottom: 16 }}>
            <h1 className="t-h2" style={{ marginBottom: 2 }}>{detail.name}</h1>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              {detail.kelasName} · SP {detail.sp}
              {detail.spKotor !== detail.sp && ` (sebelum pemutihan: SP ${detail.spKotor})`}
              {' · '}alpa {detail.alpa} · izin {detail.izin}
            </p>
            {detail.penetapan.length > 0 && (
              <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
                Penetapan:{' '}
                {detail.penetapan
                  .map((r) => `SP${r.level} ${tanggalPanjang(r.tanggal)} (${r.pemicu})`)
                  .join(' · ')}
              </p>
            )}
            <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 4 }}>
              Centang tanggal yang diputihkan — sesi itu tak lagi dihitung untuk SP maupun
              persentase kehadiran. Baris presensi aslinya tetap tersimpan, dan pembatalan
              meninggalkan jejak.
            </p>
          </div>

          <SPDetailClient anggotaId={detail.anggotaId} sesi={sesi} riwayat={riwayat} />
        </div>
      </div>
    </main>
  );
}
