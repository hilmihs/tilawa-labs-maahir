import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionWa, findSelfAttendanceMembership, isTakhassusKelas } from '@/lib/program-kelas';
import { getUnfilledDaysForAnggota, PROGRAM_LABEL } from '@/lib/maahir-presensi';
import { berlakuPeriodeBerjalan, getSetoranTargets, targetResolver } from '@/lib/setoran-target';
import { todayJakarta } from '@/lib/anggota-periode';
import { LogoutButton } from '@/components/LogoutButton';
import { SelfPresensiForm } from './SelfPresensiForm';
import { TargetSayaForm } from './TargetSayaForm';
import { RemindKetuaButton } from './RemindKetuaButton';
import { LiburRequestForm } from '../ketua-kelas/libur/LiburRequestForm';

export const dynamic = 'force-dynamic';

export default async function MaahirMandiriPage() {
  const wa = await getSessionWa();
  if (!wa) redirect('/');

  const membership = await findSelfAttendanceMembership(wa);

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark"><span className="mark">M</span> Presensi Mandiri</div>
          <LogoutButton />
        </div>
        <div className="page">{children}</div>
      </div>
    </main>
  );

  if (!membership) {
    return (
      <Shell>
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Presensi Mandiri</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Akun Anda tidak terdaftar di kelas presensi mandiri.
        </p>
        <Link href="/" className="btn btn-ghost btn-block" style={{ marginTop: 16 }}>← Beranda</Link>
      </Shell>
    );
  }

  const { kelas, anggotaId, anggotaName } = membership;
  const isLeader = kelas.ketua_wa === wa || kelas.wakil_wa === wa;
  const unfilled = await getUnfilledDaysForAnggota(kelas, anggotaId);

  // Blok "Ajukan libur" (untuk ketua/wakil) — tampil inline di presensi mandiri.
  const liburBlock = isLeader ? (
    <div style={{ marginTop: 20 }}>
      <div className="t-tiny" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Ajukan libur pertemuan (ketua/wakil)
      </div>
      <LiburRequestForm kelasOptions={[{ id: kelas.id, name: kelas.name }]} />
    </div>
  ) : null;

  const riwayatLink = (
    <Link href="/2in1/maahir-mandiri/riwayat" className="card-flat"
      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginTop: 12, textDecoration: 'none', color: 'inherit', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Riwayat Kehadiran &amp; Setoran</div>
        <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>Lihat & edit presensi Anda</div>
      </div>
      <span style={{ color: 'var(--muted-2)' }}>→</span>
    </Link>
  );

  // Target hafalan bulanan — hanya kelas Takhassus yang menyetor. Pesertanya
  // memasang sendiri karena kelas ini presensi-mandiri dan tak punya ketua di
  // alur presensi.
  const targetBlock = isTakhassusKelas(kelas.name) ? await renderTargetBlock(kelas.id, anggotaId) : null;

  if (unfilled.length === 0) {
    return (
      <Shell>
        <div className="banner banner-success" style={{ marginBottom: 16 }}>
          <div>
            <div className="title">Presensi Anda sudah lengkap</div>
            <div className="desc">{kelas.name} — tidak ada hari yang perlu diisi.</div>
          </div>
        </div>
        {riwayatLink}
        {targetBlock}
        {liburBlock}
        <Link href="/" className="btn btn-ghost btn-block" style={{ marginTop: 16 }}>← Beranda</Link>
      </Shell>
    );
  }

  const day = unfilled[0];
  const askSetoran = day.program === 'kelas_maahir' && isTakhassusKelas(kelas.name);
  const tanggalLabel = new Date(day.tanggal + 'T00:00:00').toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  const timeRange = day.waktu_mulai
    ? `${day.waktu_mulai.slice(0, 5)}${day.waktu_selesai ? ' – ' + day.waktu_selesai.slice(0, 5) : ''}`
    : null;

  return (
    <Shell>
      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, borderLeft: '3px solid var(--accent)', background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{anggotaName}</div>
          <span className="badge badge-kuning"><span className="dot" /> Sisa {day.totalRemaining}</span>
        </div>
        <div className="t-small" style={{ marginTop: 2 }}>{kelas.name} · {PROGRAM_LABEL[day.program] ?? day.program}</div>
        <div className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 2 }}>
          {tanggalLabel}{timeRange ? ` · ${timeRange}` : ''}
        </div>
      </div>

      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Tandai kehadiran Anda sendiri{askSetoran ? ' dan isi jumlah halaman setoran' : ''}. Setelah disimpan,
        lanjut otomatis ke hari berikutnya yang belum terisi.
      </p>

      <SelfPresensiForm
        key={`${day.tanggal}|${day.program}`}
        kelasId={kelas.id}
        anggotaId={anggotaId}
        tanggal={day.tanggal}
        program={day.program}
        remaining={day.totalRemaining}
        askSetoran={askSetoran}
      />

      {/* Reminder ke ketua bila hari ini sebetulnya libur (untuk non-ketua). */}
      {!isLeader && <RemindKetuaButton kelasId={kelas.id} tanggal={day.tanggal} />}

      {riwayatLink}
      {targetBlock}
      {liburBlock}
    </Shell>
  );
}

/**
 * Kartu "Target hafalan saya". Angka yang ditampilkan adalah yang BERLAKU hari
 * ini — bisa berasal dari setelan peserta sendiri, atau dari default kelas yang
 * dipasang koordinator. Bedanya disebutkan supaya peserta tahu ia sedang
 * mengikuti angka orang lain atau angkanya sendiri.
 */
async function renderTargetBlock(kelasId: string, anggotaId: string) {
  const rows = await getSetoranTargets([kelasId]);
  const hariIni = todayJakarta();
  const berlaku = targetResolver(rows)(kelasId, anggotaId, hariIni);
  const punyaKoreksi = rows.some((r) => r.anggotaId === anggotaId && r.berlakuMulai <= hariIni);
  const berlakuMulai = berlakuPeriodeBerjalan();
  const berlakuLabel = new Date(berlakuMulai + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  return (
    <TargetSayaForm
      nilai={berlaku}
      berlakuLabel={berlakuLabel}
      sumberDefault={berlaku !== null && !punyaKoreksi}
    />
  );
}
