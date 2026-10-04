import { redirect } from 'next/navigation';

// Sistem observasi lama (kelas_hits/observasi_kelas) sudah di-retire.
// Semua ketua kelas kini memakai subsistem HITS soft-skill (/hits/ketua).
export const dynamic = 'force-dynamic';

export default function ObservasiKetuaKelasRetired() {
  redirect('/hits/ketua');
}
