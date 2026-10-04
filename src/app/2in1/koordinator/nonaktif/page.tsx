import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { listOrang } from '@/lib/orang-aktif';
import { NonaktifClient } from './NonaktifClient';

export const dynamic = 'force-dynamic';

export default async function NonaktifOrangPage() {
  await requireKoordinator();
  const orang = await listOrang();

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} dashboard
          </Link>
          <LogoutButton />
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Nonaktifkan Orang
          </h1>
          <p className="t-small" style={{ marginBottom: 14 }}>
            Menonaktifkan seseorang menghapusnya dari daftar setoran, presensi
            kelas Maahir, rekap kehadiran, dan laporan bulanan sekaligus.
          </p>

          <div className="banner banner-error" style={{ marginBottom: 16 }}>
            <div>
              <div className="title">Sebelum menonaktifkan</div>
              <div className="desc">
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>
                    Orang yang dinonaktifkan hilang dari <strong>seluruh</strong>{' '}
                    rekap dan laporan, termasuk bulan-bulan yang sudah lewat —
                    rata-rata kelas pada laporan lama akan berubah.
                  </li>
                  <li>Presensi yang sudah tercatat tidak dihapus, hanya tak lagi ditampilkan.</li>
                  <li>Bisa diaktifkan kembali kapan saja lewat halaman ini.</li>
                  <li>Koordinator dan syaikh tak bisa dinonaktifkan di sini.</li>
                </ul>
              </div>
            </div>
          </div>

          <NonaktifClient orang={orang} />
        </div>
      </div>
    </main>
  );
}
