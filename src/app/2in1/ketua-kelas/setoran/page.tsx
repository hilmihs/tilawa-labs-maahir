import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaWakilKelas, isTakhassusKelas } from '@/lib/program-kelas';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { monthOptionsSince } from '@/lib/month';
import { PRESENSI_ANCHOR } from '@/lib/maahir-presensi';
import { berlakuPeriodeBerjalan, getSetoranTargets, targetResolver } from '@/lib/setoran-target';
import { todayJakarta } from '@/lib/anggota-periode';
import { getTakhassusVia } from '@/lib/takhassus-via-halaqah';
import { Icon } from '@/components/icons';
import { hariKelas, kelompokkanKelas } from '@/lib/grup-sesi';
import { SetoranGrid, type GridPertemuan, type GridPeserta } from './SetoranGrid';
import { TargetPesertaPanel, type TargetBaris } from './TargetPesertaPanel';

export const dynamic = 'force-dynamic';

const ANCHOR_MONTH = PRESENSI_ANCHOR.slice(0, 7);

/**
 * Rentang pengisian setoran = periode laporan berjalan saja (28 bulan lalu s/d
 * 27 bulan ini).
 *
 * Dulu DUA periode dibuka supaya pertemuan sebelum tanggal 28 masih bisa
 * disusulkan. Kebijakan rapat Agustus 2026 meniadakan alasan itu: begitu
 * tanggal 28 lewat, periode lama terkunci di semua jalur tulis (lihat
 * presensiTerbuka di periode-laporan.ts). Membuka dua periode di sini hanya
 * akan menampilkan pertemuan yang tombol simpannya pasti ditolak server.
 */
const PERIODE_DIBUKA = 1;

function periodeRange(month: string): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const startD = new Date(Date.UTC(y, m - 1 - PERIODE_DIBUKA, 28));
  const start = startD.toISOString().slice(0, 10);
  const end = `${y}-${String(m).padStart(2, '0')}-27`;
  const f = (iso: string) =>
    new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', timeZone: 'UTC',
    });
  return { start, end, label: `${f(start)} – ${f(end)}` };
}

export default async function SetoranKetuaPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const semuaKelas = await findKetuaWakilKelas(wa);
  if (semuaKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua / Wakil Ketua Kelas.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>← Kembali</Link>
      </main>
    );
  }

  // Setoran hafalan hanya untuk peserta Takhassus: kelas Takhassus, plus kelas
  // halaqah tempat peserta Takhassus dipresensi (sejak tanggal pengalihannya).
  const kelasTakhassus = semuaKelas.filter((k) => isTakhassusKelas(k.name));
  const via = await getTakhassusVia();
  // Kelas tanpa jadwal (At-Tibyan gabungan) tak punya sesi kelas_maahir.
  const lainIds = semuaKelas
    .filter((k) => !isTakhassusKelas(k.name) && (k.jadwal_hari ?? []).length > 0)
    .map((k) => k.id);
  const { data: viaRows } =
    via.size > 0 && lainIds.length > 0
      ? await supabaseAdmin
          .from('program_kelas_anggota')
          .select('id, program_kelas_id, name, whatsapp_number')
          .in('program_kelas_id', lainIds)
          .in('whatsapp_number', [...via.keys()])
          .eq('active', true)
          .order('name')
      : { data: [] };
  const anggotaVia = ((viaRows ?? []) as Array<{
    id: string; program_kelas_id: string; name: string; whatsapp_number: string;
  }>).map((a) => ({ ...a, mulai: via.get(a.whatsapp_number)!.mulai }));
  const kelasHalaqah = semuaKelas.filter((k) => anggotaVia.some((a) => a.program_kelas_id === k.id));
  const myKelas = [...kelasTakhassus, ...kelasHalaqah];
  if (myKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Kelas ini tidak mengisi setoran hafalan. Setoran hanya untuk peserta
          Maahir Takhassus Ikhwan &amp; Akhwat.
        </p>
        <Link href="/2in1/ketua-kelas" className="btn btn-ghost" style={{ marginTop: 16 }}>← Kembali</Link>
      </main>
    );
  }

  const nowMonth = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 7);
  const month =
    searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month) ? searchParams.month : nowMonth;
  const { start, end, label } = periodeRange(month);

  const kelasIds = myKelas.map((k) => k.id);
  const { data: pertemuanRows } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, tanggal')
    .in('program_kelas_id', kelasIds)
    .eq('program', 'kelas_maahir')
    .gte('tanggal', start)
    .lte('tanggal', end)
    .order('tanggal');
  const pertemuanList = (pertemuanRows ?? []) as Array<{
    id: string; program_kelas_id: string; tanggal: string;
  }>;

  const { data: anggotaRows } = await supabaseAdmin
    .from('program_kelas_anggota')
    .select('id, program_kelas_id, name')
    .in('program_kelas_id', kelasTakhassus.map((k) => k.id))
    .eq('active', true)
    .order('name');
  // Di kelas halaqah hanya peserta Takhassus-nya yang menyetor, dan hanya sejak
  // tanggal pengalihan. `mulai` null = kelas Takhassus (semua sesi).
  const anggotaList = [
    ...((anggotaRows ?? []) as Array<{ id: string; program_kelas_id: string; name: string }>)
      .filter((a) => kelasTakhassus.some((k) => k.id === a.program_kelas_id))
      .map((a) => ({ ...a, mulai: null as string | null })),
    ...anggotaVia,
  ];

  const pertemuanIds = pertemuanList.map((p) => p.id);
  const { data: kehadiranRows } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('pertemuan_id, anggota_id, status, setoran_halaman')
    .in('pertemuan_id', pertemuanIds.length ? pertemuanIds : ['00000000-0000-0000-0000-000000000000']);
  const kehadiranByKey = new Map(
    (kehadiranRows ?? [])
      .filter((k) => k.anggota_id)
      .map((k) => [
        `${k.pertemuan_id}|${k.anggota_id}`,
        { status: k.status as string, setoran: (k.setoran_halaman as number | null) ?? null },
      ])
  );

  const blocks = myKelas
    .map((k) => {
      const pesKelas = anggotaList.filter((a) => a.program_kelas_id === k.id);
      // Kelas halaqah: kolom mulai dari tanggal pengalihan paling awal anggotanya.
      const dari = pesKelas.reduce<string | null>(
        (m, a) => (a.mulai === null ? m : m === null || a.mulai < m ? a.mulai : m),
        null
      );
      const pert: GridPertemuan[] = pertemuanList
        .filter((p) => p.program_kelas_id === k.id && (dari === null || p.tanggal >= dari))
        .map((p) => ({
          id: p.id,
          tanggal: p.tanggal,
          label: `${p.tanggal.slice(8, 10)}/${p.tanggal.slice(5, 7)}`,
        }));
      const pes: GridPeserta[] = pesKelas
        .map((a) => ({
          id: a.id,
          name: a.name,
          sel: Object.fromEntries(
            pert.map((p) => {
              const row = kehadiranByKey.get(`${p.id}|${a.id}`);
              return [
                p.id,
                {
                  halaman: row?.setoran != null ? String(row.setoran) : '',
                  hadir: row?.status === 'hadir' || row?.status === 'terlambat',
                  adaPresensi: !!row,
                },
              ];
            })
          ),
        }));
      return { kelas: k, pert, pes };
    })
    .filter((b) => b.pert.length > 0 && b.pes.length > 0);
  // Kelas per hari yang segrup sesi tampil di bawah satu judul sesi; grid
  // tetap per hari karena baris anggota & kolom pertemuan milik kelas harinya.
  const entriBlok = kelompokkanKelas(blocks, (b) => ({
    id: b.kelas.id,
    grupSesi: b.kelas.grup_sesi,
    gender: b.kelas.gender,
    jadwalHari: b.kelas.jadwal_hari,
  }));

  // Target hafalan bulanan per peserta. Dipisah dari `blocks` supaya panelnya
  // tetap muncul pada bulan yang belum punya pertemuan sama sekali — target
  // justru paling perlu dipasang sebelum kelas berjalan.
  // Target tetap milik kelas Takhassus; ketua halaqah tak mengaturnya.
  const targetRows = await getSetoranTargets(kelasTakhassus.map((k) => k.id));
  const hariIni = todayJakarta();
  const berlakuPada = targetResolver(targetRows);
  const berlakuLabel = new Date(berlakuPeriodeBerjalan() + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  const targetBlocks = kelasTakhassus
    .map((k) => ({
      kelas: k,
      baris: anggotaList
        .filter((a) => a.program_kelas_id === k.id)
        .map((a): TargetBaris => {
          const nilai = berlakuPada(k.id, a.id, hariIni);
          const punyaKoreksi = targetRows.some(
            (r) => r.anggotaId === a.id && r.berlakuMulai <= hariIni
          );
          return {
            anggotaId: a.id,
            name: a.name,
            nilai,
            sumberDefault: nilai !== null && !punyaKoreksi,
          };
        }),
    }))
    .filter((b) => b.baris.length > 0);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Setoran Hafalan
          </div>
          <Link href="/2in1/ketua-kelas" className="back">{Icon.back(12)} Menu Ketua</Link>
        </div>

        <div className="page">
          <div className="section-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div>
              <h1 className="t-h2" style={{ marginBottom: 2 }}>Isi setoran pertemuan yang lalu</h1>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                {label} · isi jumlah halaman tiap peserta per pertemuan. Pertemuan
                lebih lama lagi: ganti bulan lewat dropdown di kanan.
              </p>
            </div>
            <MonthNavSelect options={monthOptionsSince(ANCHOR_MONTH)} value={month} />
          </div>

          {targetBlocks.map((b) => (
            <TargetPesertaPanel
              key={b.kelas.id}
              kelasId={b.kelas.id}
              kelasName={b.kelas.name}
              baris={b.baris}
              berlakuLabel={berlakuLabel}
            />
          ))}

          {blocks.length === 0 ? (
            <div className="card-flat" style={{ padding: 20 }}>
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>
                Belum ada pertemuan Kelas Maahir pada periode ini.
              </p>
            </div>
          ) : (
            entriBlok.map((e) =>
              e.jenis === 'tunggal' ? (
                <section key={e.kunci} style={{ marginBottom: 24 }}>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
                    {e.kelas.kelas.name.toUpperCase()} · {e.kelas.pert.length} pertemuan · {e.kelas.pes.length} peserta
                  </div>
                  <SetoranGrid pertemuan={e.kelas.pert} peserta={e.kelas.pes} />
                </section>
              ) : (
                <section key={e.kunci} style={{ marginBottom: 24 }}>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 6, fontWeight: 600 }}>
                    {e.label.toUpperCase()} · {e.anggota.reduce((n, b) => n + b.pert.length, 0)} pertemuan ·{' '}
                    {new Set(e.anggota.flatMap((b) => b.pes.map((p) => p.name.trim().toLowerCase()))).size} peserta
                  </div>
                  {e.anggota.map((b) => (
                    <div key={b.kelas.id} style={{ marginBottom: 14 }}>
                      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 4 }}>
                        {hariKelas(b.kelas.jadwal_hari) || b.kelas.name} · {b.pert.length} pertemuan · {b.pes.length} peserta
                      </div>
                      <SetoranGrid pertemuan={b.pert} peserta={b.pes} />
                    </div>
                  ))}
                </section>
              )
            )
          )}
        </div>
      </div>
    </main>
  );
}
