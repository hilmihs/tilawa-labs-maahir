import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionWa, findKetuaProgramKelas } from '@/lib/program-kelas';
import { NewPertemuanForm } from './NewPertemuanForm';
import { kelompokkanKelas, namaTampilKelas } from '@/lib/grup-sesi';

export const dynamic = 'force-dynamic';

export default async function NewPertemuanPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) redirect('/2in1/ketua-kelas');
  const entriKelas = kelompokkanKelas(myKelas, (k) => ({
    id: k.id,
    grupSesi: k.grup_sesi,
    gender: k.gender,
    jadwalHari: k.jadwal_hari,
  }));

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/ketua-kelas" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">Catat Pertemuan</div>
          <div className="sub">
            {entriKelas.map((e) => (e.jenis === 'grup' ? e.label : e.kelas.name)).join(' · ')}
          </div>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <NewPertemuanForm
          // Urut per entri supaya kelas per hari segrup berdampingan; harinya
          // jadi pembeda di pilihan kelas.
          kelasList={entriKelas.flatMap((e) => (e.jenis === 'grup' ? e.anggota : [e.kelas])).map((k) => ({
            id: k.id,
            name: namaTampilKelas(k, { denganHari: true }),
            waktu_mulai: k.waktu_mulai,
            waktu_selesai: k.waktu_selesai,
          }))}
        />
      </div>
    </main>
  );
}
