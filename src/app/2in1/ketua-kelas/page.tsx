import Link from 'next/link';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSessionWa, findKetuaProgramKelas, isTakhassusKelas } from '@/lib/program-kelas';
import { getUnfilledMaahirDays } from '@/lib/maahir-presensi';
import { adaTakhassusVia } from '@/lib/takhassus-via-halaqah';
import { kelompokkanKelas, namaTampilKelas, ringkasJadwalGrup } from '@/lib/grup-sesi';
import { Icon } from '@/components/icons';
import { SectionHeader } from '@/components/ui/SectionHeader';

export const dynamic = 'force-dynamic';

const PROGRAM_LABEL: Record<string, string> = {
  kelas_maahir: 'Kelas Maahir',
  at_tibyan: 'At-Tibyan',
  muallim_najih: "Mu'allim Najih",
};

export default async function KetuaKelasPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const myKelas = await findKetuaProgramKelas(wa);
  if (myKelas.length === 0) {
    return (
      <main style={{ padding: 24 }}>
        <p className="t-body" style={{ color: 'var(--muted-2)' }}>
          Halaman ini hanya untuk Ketua / Wakil Ketua Kelas program Maahir.
        </p>
        <Link href="/" className="btn btn-ghost" style={{ marginTop: 16 }}>
          ← Kembali
        </Link>
      </main>
    );
  }

  const kelasIds = myKelas.map((k) => k.id);
  // Kelas per hari yang segrup sesi (grup_sesi) tampil sebagai satu entri.
  const entriKelas = kelompokkanKelas(myKelas, (k) => ({
    id: k.id,
    grupSesi: k.grup_sesi,
    gender: k.gender,
    jadwalHari: k.jadwal_hari,
  }));

  const unfilledCount = (await getUnfilledMaahirDays(wa)).length;
  // Menu setoran: kelas Takhassus, atau kelas halaqah yang memuat peserta Takhassus.
  const isiSetoran =
    myKelas.some((k) => isTakhassusKelas(k.name)) || (await adaTakhassusVia(
      // Kelas tanpa jadwal (At-Tibyan gabungan) tak punya sesi kelas_maahir.
      myKelas.filter((k) => (k.jadwal_hari ?? []).length > 0).map((k) => k.id)
    ));

  // Pertemuan bulan ini untuk semua kelas yang dipimpin
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const monthStart = `${year}-${month}-01`;
  const nextMonth = now.getMonth() === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(now.getMonth() + 2).padStart(2, '0')}-01`;

  const { data: pertemuanList } = await supabaseAdmin
    .from('pertemuan_program')
    .select('id, program_kelas_id, program, tanggal, nama_kegiatan, waktu_mulai, waktu_selesai')
    .in('program_kelas_id', kelasIds)
    .gte('tanggal', monthStart)
    .lt('tanggal', nextMonth)
    .order('tanggal', { ascending: false });

  const pertemuanIds = (pertemuanList ?? []).map((p) => p.id);
  const { data: kehadiranCounts } = await supabaseAdmin
    .from('kehadiran_peserta')
    .select('pertemuan_id, status')
    .in('pertemuan_id', pertemuanIds.length ? pertemuanIds : ['00000000-0000-0000-0000-000000000000']);

  const countByPertemuan = new Map<string, { hadir: number; total: number }>();
  for (const k of kehadiranCounts ?? []) {
    const prev = countByPertemuan.get(k.pertemuan_id) ?? { hadir: 0, total: 0 };
    prev.total += 1;
    if (k.status === 'hadir' || k.status === 'terlambat') prev.hadir += 1;
    countByPertemuan.set(k.pertemuan_id, prev);
  }

  const kelasById = new Map(myKelas.map((k) => [k.id, k]));
  const pertemuanWithMeta = (pertemuanList ?? []).map((p) => ({
    ...p,
    counts: countByPertemuan.get(p.id) ?? null,
    programLabel: PROGRAM_LABEL[p.program] ?? p.program,
    // Kelas bergrup → label sesi; harinya sudah terbaca di tanggal kartu.
    kelasName: namaTampilKelas(kelasById.get(p.program_kelas_id) ?? { name: '' }),
  }));

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const pertemuanToday = pertemuanWithMeta.filter((p) => p.tanggal === todayStr);
  const pertemuanOther = pertemuanWithMeta.filter((p) => p.tanggal !== todayStr);

  const monthLabel = now.toLocaleDateString('id-ID', { year: 'numeric', month: 'long' });

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span> Ketua Kelas
          </div>
          <Link href="/" className="back">
            {Icon.back(12)} Beranda
          </Link>
        </div>

        <div className="page">
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            {entriKelas.map((e) => (e.jenis === 'grup' ? e.label : e.kelas.name)).join(' · ')}
          </p>

          {unfilledCount > 0 && (
            <Link
              href="/2in1/ketua-kelas/presensi"
              className="banner banner-error"
              style={{ display: 'block', textDecoration: 'none', marginBottom: 16 }}
            >
              <div className="desc">
                <strong>{unfilledCount} presensi belum diisi.</strong> Tap untuk isi sekarang →
              </div>
            </Link>
          )}

          <Link
            href="/2in1/ketua-kelas/rekap"
            className="card-flat"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              marginBottom: 12,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Rekap Kehadiran Bulanan</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                Riwayat H/I/S/A/T per anggota
              </div>
            </div>
            <span style={{ color: 'var(--muted-2)' }}>→</span>
          </Link>

          {/* Setoran hafalan hanya untuk kelas Takhassus. */}
          {isiSetoran && (
            <Link
              href="/2in1/ketua-kelas/setoran"
              className="card-flat"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 14px',
                marginBottom: 12,
                textDecoration: 'none',
                color: 'inherit',
                borderRadius: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Setoran Hafalan (isi cepat)</div>
                <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  Isi jumlah halaman per pertemuan — termasuk pertemuan yang sudah lalu
                </div>
              </div>
              <span style={{ color: 'var(--muted-2)' }}>→</span>
            </Link>
          )}

          <Link
            href="/2in1/ketua-kelas/pertemuan"
            className="card-flat"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              marginBottom: 12,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Riwayat Pertemuan</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                Semua pertemuan (semua bulan) — lihat & edit kehadiran
              </div>
            </div>
            <span style={{ color: 'var(--muted-2)' }}>→</span>
          </Link>

          <Link
            href="/2in1/ketua-kelas/libur"
            className="card-flat"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 14px',
              marginBottom: 12,
              textDecoration: 'none',
              color: 'inherit',
              borderRadius: 10,
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Ajukan Libur Pertemuan</div>
              <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                Minta koordinator meliburkan tanggal — kehadiran teranulir
              </div>
            </div>
            <span style={{ color: 'var(--muted-2)' }}>→</span>
          </Link>

          {/* Jadwal info */}
          {entriKelas.map((e) =>
            e.jenis === 'grup' ? (
              <div key={e.kunci} className="card" style={{ padding: '8px 12px', marginBottom: 8, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{e.label}</div>
                <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {ringkasJadwalGrup(
                    e.anggota.map((k) => ({
                      jadwalHari: k.jadwal_hari,
                      waktuMulai: k.waktu_mulai,
                      waktuSelesai: k.waktu_selesai,
                    }))
                  )}
                </div>
              </div>
            ) : (
              <div key={e.kunci} className="card" style={{ padding: '8px 12px', marginBottom: 8, background: 'var(--surface-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{e.kelas.name}</div>
                <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {(e.kelas.jadwal_hari ?? []).join(', ')}
                  {e.kelas.waktu_mulai ? ` · ${e.kelas.waktu_mulai.slice(0, 5)}${e.kelas.waktu_selesai ? ' – ' + e.kelas.waktu_selesai.slice(0, 5) : ''}` : ''}
                </div>
              </div>
            )
          )}

          {pertemuanToday.length > 0 && (
            <div style={{ margin: '20px 0' }}>
              <SectionHeader title="Hari ini" style={{ marginBottom: 8 }} />
              {pertemuanToday.map((p) => (
                <PertemuanCard key={p.id} p={p} highlight />
              ))}
            </div>
          )}

          <SectionHeader
            title={monthLabel}
            style={{ margin: '16px 2px 10px' }}
            right={
              <Link
                href="/2in1/ketua-kelas/pertemuan/new"
                className="btn btn-sm btn-primary"
                style={{ padding: '3px 10px', fontSize: 12, textDecoration: 'none' }}
              >
                + Catat Pertemuan
              </Link>
            }
          />

          {pertemuanOther.length === 0 && pertemuanToday.length === 0 && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
              Belum ada pertemuan bulan ini. Tap &quot;+ Catat Pertemuan&quot; untuk mulai.
            </p>
          )}

          {pertemuanOther.map((p) => (
            <PertemuanCard key={p.id} p={p} />
          ))}
        </div>
      </div>
    </main>
  );
}

function PertemuanCard({ p, highlight }: {
  p: {
    id: string;
    programLabel: string;
    kelasName: string;
    tanggal: string;
    nama_kegiatan: string;
    waktu_mulai: string | null;
    waktu_selesai: string | null;
    counts: { hadir: number; total: number } | null;
  };
  highlight?: boolean;
}) {
  const tanggalLabel = new Date(p.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
  const timeRange = p.waktu_mulai
    ? `${p.waktu_mulai.slice(0, 5)}${p.waktu_selesai ? ' – ' + p.waktu_selesai.slice(0, 5) : ''}`
    : null;

  return (
    <Link href={`/2in1/ketua-kelas/pertemuan/${p.id}`} style={{ textDecoration: 'none' }}>
      <div className="card" style={{
        padding: '10px 14px',
        marginBottom: 8,
        borderLeft: highlight ? '3px solid var(--accent)' : undefined,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.programLabel}</div>
            <div className="t-small">{p.nama_kegiatan} · {p.kelasName}</div>
            <div className="t-tiny" style={{ marginTop: 2 }}>
              {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {p.counts ? (
              <span className="badge badge-hijau">
                <span className="dot" />
                {p.counts.hadir}/{p.counts.total}
              </span>
            ) : (
              <span className="badge badge-kuning">
                <span className="dot" />
                Isi →
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
