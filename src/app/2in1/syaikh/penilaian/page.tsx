import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Penilaian Peserta dipindah jadi fitur standalone di /penilaian.
export default function SyaikhPenilaianRedirect() {
  redirect('/penilaian');
}
