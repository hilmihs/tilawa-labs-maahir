// Rute lama. Daftar blok dan tabel 14 indikator dulu tinggal di dua halaman
// berbeda — masing-masing dengan halaman rincian sendiri, jadi yang masuk lewat
// sini kehilangan catatan koordinator & risk profile tanpa tahu ada versi yang
// lebih lengkap. Sekarang keduanya satu halaman dengan tombol Blok/Tabel.
import { redirect } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function MatrixLamaRedirect({
  searchParams,
}: {
  searchParams: { bulan?: string };
}) {
  await requireOneOfRoles(['koordinator', 'syaikh']);

  const p = new URLSearchParams({ tampilan: 'blok' });
  if (searchParams.bulan && /^\d{4}-\d{2}$/.test(searchParams.bulan)) {
    p.set('bulan', searchParams.bulan);
  }
  redirect(`/matrix/koordinator?${p.toString()}`);
}
