import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, isTakhassusKelas } from '@/lib/program-kelas';
import { getTakhassusVia, setorViaHalaqah } from '@/lib/takhassus-via-halaqah';
import { KehadiranForm } from './KehadiranForm';
import { namaTampilKelas } from '@/lib/grup-sesi';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  at_tibyan: 'At-Tibyan',
  muallim_najih: "Mu'allim Najih",
};

export default async function PertemuanDetailPage({ params }: { params: { id: string } }) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const { data: pertemuan } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, nama_kegiatan, materi, waktu_mulai, waktu_selesai, program_kelas:program_kelas_id(id, name, ketua_wa, wakil_wa, grup_sesi)')
    .eq('id', params.id)
    .single();

  if (!pertemuan || !pertemuan.program_kelas_id) redirect('/2in1/ketua-kelas');
  const kelas = pertemuan.program_kelas as unknown as {
    id: string; name: string; ketua_wa: string | null; wakil_wa: string | null;
    grup_sesi: string | null;
  };
  if (kelas.ketua_wa !== wa && kelas.wakil_wa !== wa) redirect('/2in1/ketua-kelas');

  // Semua anggota kelas program ini
  const { data: anggotaList } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, name, is_ketua, is_wakil, whatsapp_number')
    .eq('program_kelas_id', kelas.id)
    .eq('active', true)
    // Yang sudah pindah kelas tak lagi dipresensi pada tanggal pertemuan ini.
    .or(`mulai_tanggal.is.null,mulai_tanggal.lte.${pertemuan.tanggal}`)
    .or(`selesai_tanggal.is.null,selesai_tanggal.gte.${pertemuan.tanggal}`)
    .order('name');

  // Kehadiran existing
  const { data: existingKehadiran } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('anggota_id, status, catatan, setoran_halaman, mode')
    .eq('pertemuan_id', params.id);

  const kehadiranMap = new Map<
    string,
    { status: string; catatan: string | null; setoran: number | null; mode: string | null }
  >(
    (existingKehadiran ?? [])
      .filter((k) => k.anggota_id)
      .map((k) => [
        k.anggota_id as string,
        {
          status: k.status,
          catatan: k.catatan,
          setoran: k.setoran_halaman ?? null,
          mode: (k.mode as string | null) ?? null,
        },
      ])
  );

  // Peserta Takhassus yang dipresensi di kelas halaqah ini: setorannya diisi di sini.
  const via = await getTakhassusVia();

  type StatusType = 'hadir' | 'izin' | 'terlambat' | 'sakit' | 'tidak_ada_keterangan';
  const anggotaWithStatus = (anggotaList ?? []).map((a) => ({
    id: a.id,
    name: a.name + (a.is_ketua ? ' (Ketua)' : a.is_wakil ? ' (Wakil)' : ''),
    status: (kehadiranMap.get(a.id)?.status ?? 'tidak_ada_keterangan') as StatusType,
    catatan: kehadiranMap.get(a.id)?.catatan ?? '',
    setoran:
      kehadiranMap.get(a.id)?.setoran != null ? String(kehadiranMap.get(a.id)!.setoran) : '',
    mode: (kehadiranMap.get(a.id)?.mode === 'online' ? 'online' : 'offline') as 'offline' | 'online',
    takhassus:
      pertemuan.program === 'kelas_maahir' &&
      setorViaHalaqah(
        via,
        { program_kelas_id: kelas.id, whatsapp_number: a.whatsapp_number },
        pertemuan.tanggal
      ),
  }));

  const tanggalLabel = new Date(pertemuan.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main style={{ padding: '0 0 80px' }}>
      <div className="page-header">
        <Link href="/2in1/ketua-kelas" className="back-btn" aria-label="Kembali">←</Link>
        <div>
          <div className="title">{PROGRAM_LABEL[pertemuan.program] ?? pertemuan.program}</div>
          {/* Kelas bergrup → label sesi; harinya ikut di tanggal. */}
          <div className="sub">{namaTampilKelas(kelas)} · {tanggalLabel}</div>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <KehadiranForm
          pertemuanId={params.id}
          pesertaList={anggotaWithStatus}
          materi={(pertemuan.materi as string | null) ?? ''}
          showSetoran={pertemuan.program === 'kelas_maahir' && isTakhassusKelas(kelas.name)}
        />
      </div>
    </main>
  );
}
