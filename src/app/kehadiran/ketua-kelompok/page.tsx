import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Ketua kelompok kini fokus ke penilaian pedagogis saja — kehadiran anggota
// sudah diisi penuh oleh ketua kelas. Arahkan langsung ke halaman penilaian.
export default function KetuaKelompokPage() {
  redirect('/kehadiran/ketua-kelompok/penilaian');
}
