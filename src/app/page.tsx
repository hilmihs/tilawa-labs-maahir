import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { AkunDemo } from '@/components/AkunDemo';
import { getSession, getAllAccesses } from '@/lib/session';
import { currentCycleStart, formatCycleRange } from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import { ROLE_LANDING } from '@/lib/roles';
import { featureLinksFor, FEATURE_GROUPS, type FeatureGroup } from '@/lib/feature-links';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';
import { isSuperadmin } from '@/lib/admin-guard';
import { getSessionWa, findKetuaProgramKelas, findSelfAttendanceMembership } from '@/lib/program-kelas';
import { getUnfilledMaahirDays, getUnfilledDaysForAnggota } from '@/lib/maahir-presensi';
import { fiturOptsMaahirPengajar } from '@/lib/maahir-checkin-pengajar-akses';
import { getAntrianCheckin, kunciSesi } from '@/lib/attendance';
import { todayJakarta } from '@/lib/anggota-periode';
import { tanggalTanpaTahun, daftarHari, jamTitik } from '@/lib/tanggal-id';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { FiturIkon, type IkonNama } from '@/components/FiturIkon';
import type { PengajarSession } from '@/types/db';

type Tugas = { href: string; title: string; sub: string; warna: 'merah' | 'kuning' };
type MenuItem = { href: string; title: string; short: string; group: FeatureGroup; ikon: IkonNama };

/** 'Ust. Abdullah Fauzi' → 'AF' — gelar berakhiran titik dilewati. */
function inisial(nama: string): string {
  const kata = nama.split(/\s+/).filter((w) => w && !w.endsWith('.'));
  return kata.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/** 'A', 'A & B', 'A, B +2' — nama unik, dipendekkan. */
function ringkasNama(nama: string[]): string {
  const unik = Array.from(new Set(nama));
  if (unik.length <= 2) return unik.join(' & ');
  return `${unik.slice(0, 2).join(', ')} +${unik.length - 2}`;
}

export const dynamic = 'force-dynamic';

export default async function HomePage({ searchParams }: { searchParams: { next?: string } }) {
  const s = await getSession();
  const accesses = await getAllAccesses();
  const nextRaw = searchParams?.next ?? '';
  const safeNext = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : null;

  if (accesses.length >= 1) {
    // Sudah login tapi diarahkan dgn ?next= (mis. ganti akun) → ke tujuan.
    if (safeNext) redirect(safeNext);

    // Ketua/wakil kelas Maahir dengan presensi terluput: dulu di-redirect paksa
    // ke halaman presensi. Karena login mendarat langsung di halaman peran,
    // redirect itu hanya kena saat orang menekan Beranda — dan sejak FeatureNav
    // dihapus, Beranda satu-satunya jalan ke menu lain, jadi mereka terkurung.
    // Kini jadi tugas merah teratas di "Perlu diselesaikan".
    const wa = await getSessionWa();
    const isKetuaMaahir = wa ? (await findKetuaProgramKelas(wa)).length > 0 : false;
    const maahirTerluput = wa && isKetuaMaahir ? await getUnfilledMaahirDays(wa) : [];

    // Presensi mandiri (kelas self_attendance, mis. Maahir Takhassus Ikhwan):
    // peserta isi sendiri lewat akunnya.
    const selfMembership = wa ? await findSelfAttendanceMembership(wa) : null;
    const selfUnfilled = selfMembership
      ? (await getUnfilledDaysForAnggota(selfMembership.kelas, selfMembership.anggotaId)).length
      : 0;

    const available = featureLinksFor(accesses, {
      superadmin: await bolehLihatFiturTersembunyi(),
      ...(await fiturOptsMaahirPengajar()),
    });
    const superadmin = await isSuperadmin();

    // Ketua Maahir / peserta mandiri tak punya entri di FEATURE_LINKS; tambah kartu sintetis.
    if (available.length === 1 && !isKetuaMaahir && !selfMembership && !superadmin) {
      redirect(available[0].href);
    }

    const userName = accesses[0]?.name ?? '';
    const today = todayJakarta();

    // "Perlu diselesaikan" — tugas yang menunggu, ditampilkan di atas menu.
    const tugas: Tugas[] = [];
    if (maahirTerluput.length > 0) {
      tugas.push({
        href: '/2in1/ketua-kelas/presensi',
        warna: 'merah',
        title: `Isi ${maahirTerluput.length} presensi kelas Maahir`,
        sub: `${ringkasNama(maahirTerluput.map((d) => d.kelasName))} · mulai yang paling lama`,
      });
    }
    const pengajar = accesses.find((a): a is PengajarSession => a.role === 'pengajar');
    if (pengajar) {
      const antrian = await getAntrianCheckin(pengajar.pengajar_id);
      if (antrian.lampau.length > 0) {
        tugas.push({
          href: '/kehadiran/pengajar',
          warna: 'merah',
          title: `Isi ${antrian.lampau.length} kehadiran yang terlewat`,
          sub: `${ringkasNama(antrian.lampau.map((p) => p.name))} · ${daftarHari(antrian.lampau.map((p) => p.tanggal))}`,
        });
      }
      const belumHariIni = antrian.hariIni.filter((p) => !antrian.terisiHariIni.includes(kunciSesi(p)));
      if (belumHariIni.length > 0) {
        const [satu] = belumHariIni;
        tugas.push({
          href: '/kehadiran/pengajar',
          warna: 'kuning',
          title: belumHariIni.length === 1 ? 'Check-in kehadiran hari ini' : `Check-in ${belumHariIni.length} sesi hari ini`,
          sub: belumHariIni.length === 1
            ? `${satu.name} · ${jamTitik(satu.waktu_mulai)}`
            : ringkasNama(belumHariIni.map((p) => p.name)),
        });
      }
    }
    if (selfMembership && selfUnfilled > 0) {
      tugas.push({
        href: '/2in1/maahir-mandiri',
        warna: 'kuning',
        title: `Isi ${selfUnfilled} presensi mandiri`,
        sub: selfMembership.kelas.name,
      });
    }

    // Menu berkelompok. Ketua Maahir / peserta mandiri / superadmin tak punya
    // entri di FEATURE_LINKS; tambah entri sintetis di kelompoknya.
    const menu: MenuItem[] = [
      ...(isKetuaMaahir
        ? [{ href: '/2in1/ketua-kelas', title: 'Presensi Kelas Maahir', short: 'Sebagai ketua kelas · Kelas Maahir, At-Tibyan', group: 'maahir' as const, ikon: 'cek' as const }]
        : []),
      ...(selfMembership
        ? [{ href: '/2in1/maahir-mandiri', title: 'Presensi Mandiri', short: `Tandai kehadiran Anda — ${selfMembership.kelas.name}`, group: 'maahir' as const, ikon: 'cek' as const }]
        : []),
      ...(superadmin
        ? [
            { href: '/admin/audit', title: 'Log Aktivitas', short: 'Riwayat audit semua aksi pengguna', group: 'admin' as const, ikon: 'daftar' as const },
            { href: '/admin/users', title: 'Manajemen User', short: 'Akun, reset password, login sebagai', group: 'admin' as const, ikon: 'atur' as const },
          ]
        : []),
      ...available,
    ];
    const kelompok = FEATURE_GROUPS.map((g) => ({
      ...g,
      items: menu.filter((m) => m.group === g.key),
    })).filter((g) => g.items.length > 0);

    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>
          <header className="beranda-head" data-tumpang={tugas.length > 0 ? '' : undefined}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="wordmark" style={{ color: 'var(--emas)' }}>
                <span className="mark">M</span>
                Tilawa Labs
              </div>
              <a href="/akun" title="Akun" aria-label="Akun" className="beranda-avatar">
                {inisial(userName)}
              </a>
            </div>
            <div>
              <h1 className="beranda-salam">Assalamu&apos;alaikum, {userName}</h1>
              <div className="beranda-tanggal">
                {tanggalTanpaTahun(today)}
                {tugas.length > 0 && (
                  <>
                    {' · '}
                    <span style={{ color: 'var(--emas)', fontWeight: 600 }}>{tugas.length} hal menunggu Anda</span>
                  </>
                )}
              </div>
            </div>
          </header>

          <div className="page" style={{ paddingTop: 0 }}>
            {tugas.length > 0 && (
              <div className="card kartu-angkat fh-tumpang" style={{ overflow: 'hidden', borderRadius: 18, borderColor: 'var(--emas-line)', marginBottom: 12 }}>
                <div className="kartu-emas-head">Perlu diselesaikan</div>
                {tugas.map((t) => (
                  <a key={t.title} href={t.href} className="list-row" style={{ padding: '14px 16px', borderTop: '1px solid var(--line)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${t.warna})`, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{t.title}</div>
                      <div className="sub" style={{ fontSize: 12.5 }}>{t.sub}</div>
                    </div>
                    <span className="panah-bulat">{Icon.arrow(12)}</span>
                  </a>
                ))}
              </div>
            )}

            {kelompok.map((g) => (
              <section key={g.key}>
                <div className="t-tiny" style={{ margin: '22px 4px 8px' }}>{g.label}</div>
                <div className="card-flat" style={{ overflow: 'hidden', borderRadius: 18 }}>
                  {g.items.map((it) => (
                    <a key={it.href} href={it.href} className="list-row" style={{ padding: '14px 16px' }}>
                      <span className="menu-ikon">
                        <FiturIkon nama={it.ikon} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>{it.title}</div>
                        <div className="sub" style={{ fontSize: 12.5 }}>{it.short}</div>
                      </div>
                      <span className="arrow" style={{ color: 'var(--emas-ink)' }}>{Icon.arrow(14)}</span>
                    </a>
                  ))}
                </div>
              </section>
            ))}

            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <LogoutButton className="btn btn-sm btn-ghost" style={{ height: 40, background: 'transparent' }} />
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="login-latar">
      <div className="login-bingkai">
        {/* Key visual: logo MPT di atas forest, lembar krem naik dari bawah. */}
        <div className="login-logo" role="img" aria-label="Tilawa Labs" />
        <div className="login-lembar">
          <div style={{ marginBottom: 6 }}>
            <h1 className="t-h1" style={{ fontSize: 26, marginBottom: 6 }}>Assalamu&apos;alaikum</h1>
            <p className="t-body" style={{ color: 'var(--ink-2)' }}>
              Masuk dengan nomor WhatsApp dan password Anda.
            </p>
          </div>

          <LoginForm next={safeNext ?? undefined} />

          <AkunDemo />

          {/* Shakwa terbuka tanpa akun — pelapor luar tetap punya jalan masuk. */}
          <a href="/shakwa" className="kartu-emas" style={{ display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: 'inherit', marginTop: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>Sampaikan Shakwa</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--emas-ink-2)' }}>
                Aduan, izin, masukan, atau cerita menarik — tanpa perlu masuk
              </div>
            </div>
            <span className="panah-bulat" style={{ width: 32, height: 32 }}>{Icon.arrow(13)}</span>
          </a>

          <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', justifyContent: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--muted)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--emas)' }} />
              Periode {formatCycleRangeShort(currentCycleStart())}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
