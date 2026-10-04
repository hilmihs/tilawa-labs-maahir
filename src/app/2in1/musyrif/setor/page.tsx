import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  PesertaSetoranForm,
  type ExistingSetoran,
} from '@/components/PesertaSetoranForm';
import { Icon } from '@/components/icons';
import { LogoutButton } from '@/components/LogoutButton';
import {
  currentCycleStart,
  formatCycleRange,
  formatCycleRangeShort,
  allCyclesSinceAnchor,
  CYCLE_ANCHOR,
} from '@/lib/week';
import {
  buildWaMeUrl,
  salutation,
  syaikhTitle,
  tplMusyrifSubmitToSyaikh,
} from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { signedAudioUrl } from '@/lib/storage';
import { JENIS_REKAMAN, type JenisRekaman, type NilaiRekaman, type Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

export default async function MusyrifSetorPage() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') redirect('/2in1/musyrif/login');
  const musyrifId = s.session.musyrif_id;
  const musyrifGender = s.session.gender;
  const musyrifName = s.session.name;

  // Resolve syaikh untuk gender ini
  const { data: syaikhRaw } = await supabaseAdmin
    .from('syaikh')
    .select('id, name, gender, whatsapp_number')
    .eq('gender', musyrifGender)
    .eq('active', true)
    .order('penerima_utama', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const syaikh = syaikhRaw as
    | { id: string; name: string; gender: Gender; whatsapp_number: string }
    | null;

  const cycle = currentCycleStart();

  // Semua setoran sejak anchor (termasuk cycle berjalan) + rekamannya, sekali baca.
  const allCycles = allCyclesSinceAnchor();
  const { data: allSetoran } = await supabaseAdmin
    .from('setoran_musyrif')
    .select('id, week_start, status')
    .eq('musyrif_id', musyrifId)
    .gte('week_start', CYCLE_ANCHOR);
  const setoranIds = (allSetoran ?? []).map((r) => r.id as string);
  const { data: allRekaman } = setoranIds.length
    ? await supabaseAdmin
        .from('rekaman_musyrif')
        .select('setoran_musyrif_id, jenis, nilai, masukan, audio_url, duration_seconds, recorded_at')
        .in('setoran_musyrif_id', setoranIds)
    : { data: [] };

  type RekRow = {
    setoran_musyrif_id: string;
    jenis: JenisRekaman;
    nilai: NilaiRekaman | null;
    masukan: string | null;
    audio_url: string | null;
    duration_seconds: number | null;
    recorded_at: string | null;
  };
  const rekamanBySetoran = new Map<string, RekRow[]>();
  for (const r of (allRekaman ?? []) as RekRow[]) {
    const arr = rekamanBySetoran.get(r.setoran_musyrif_id) ?? [];
    arr.push(r);
    rekamanBySetoran.set(r.setoran_musyrif_id, arr);
  }
  const setoranByCycle = new Map(
    (allSetoran ?? []).map((r) => [r.week_start as string, r as { id: string; week_start: string; status: string }])
  );

  // --- Cycle berjalan ---
  const setoran = setoranByCycle.get(cycle) ?? null;
  const curReks = setoran ? rekamanBySetoran.get(setoran.id) ?? [] : [];
  const currentSubmittedJenis: JenisRekaman[] = curReks.filter((r) => r.audio_url).map((r) => r.jenis);

  let existing: ExistingSetoran | null = null;
  if (setoran && (setoran.status === 'submitted' || setoran.status === 'checked')) {
    let syaikhWaUrl: string | null = null;
    if (setoran.status === 'submitted' && syaikh) {
      const cekUrl = absUrl(`/2in1/syaikh/cek/${setoran.id}`);
      const waText = tplMusyrifSubmitToSyaikh({
        musyrifName: s.session.name,
        musyrifGender,
        syaikhGender: syaikh.gender,
        cekUrl,
      });
      syaikhWaUrl = buildWaMeUrl(syaikh.whatsapp_number, waText);
    }

    existing = {
      id: setoran.id,
      status: setoran.status,
      musyrifWaUrl: syaikhWaUrl,
      rekaman: curReks.map((r) => ({
        jenis: r.jenis,
        nilai: r.nilai ?? null,
        masukan: r.masukan ?? null,
      })),
    };
  }

  // Pulihkan rekaman cycle berjalan dari server (anti-hilang saat refresh /
  // ganti HP). `recordedAt` ikut dikirim supaya form bisa membandingkannya
  // dengan draf di perangkat (draf lebih baru = rekam ulang yang gagal terkirim).
  const restoredCurrent: Partial<
    Record<JenisRekaman, { audioUrl: string; durationSec: number; recordedAt: string | null }>
  > = {};
  for (const r of curReks) {
    if (!r.audio_url) continue;
    try {
      restoredCurrent[r.jenis] = {
        audioUrl: await signedAudioUrl(r.audio_url, 86400),
        durationSec: r.duration_seconds ?? 0,
        recordedAt: r.recorded_at ?? null,
      };
    } catch {
      // storage error — audio tidak bisa dipulihkan, musyrif bisa rekam ulang
    }
  }

  // Setoran yang sudah dinilai tapi masih kurang rekaman → sisanya boleh
  // disusulkan; setoran dibuka ulang dan diperiksa lagi oleh syaikh.
  const dicekBelumLengkap =
    setoran?.status === 'checked' && currentSubmittedJenis.length < JENIS_REKAMAN.length;

  // --- Backfill periode terlewat (sejak anchor): setoran_musyrif belum dicek & <3 rekaman audio ---
  const backfillCycles = allCycles
    .filter((c) => c !== cycle) // cycle berjalan ditangani form utama
    .map((c) => {
      const st = setoranByCycle.get(c);
      const reks = st ? rekamanBySetoran.get(st.id) ?? [] : [];
      return {
        cycleStart: c,
        label: formatCycleRange(c),
        status: st?.status,
        submittedJenis: reks.filter((r) => r.audio_url).map((r) => r.jenis),
      };
    })
    .filter((bc) => bc.status !== 'checked' && bc.submittedJenis.length < JENIS_REKAMAN.length)
    .map(({ status: _status, ...bc }) => bc);

  const sapaan = salutation(musyrifGender);
  const titel = syaikh ? syaikhTitle(syaikh.gender) : musyrifGender === 'ikhwan' ? 'Syaikh' : 'Ustadzah';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className="topbar">
          <div className="wordmark">
            <span className="mark">M</span>Maahir
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link
              href="/2in1/musyrif"
              className="btn btn-sm btn-ghost"
              style={{ height: 30, padding: '0 10px', textDecoration: 'none' }}
            >
              {Icon.back(12)} Dashboard
            </Link>
            <LogoutButton />
          </div>
        </div>

        <div className="page">
          <div className="row" style={{ padding: '4px 0 14px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sapaan}</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{s.session.name}</div>
            </div>
            <span className="pekan-tag">
              <span className="dot" />
              Periode {formatCycleRangeShort(cycle)}
            </span>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 2 }}>
            Setoran ke {titel}
          </h1>
          <p className="t-small" style={{ marginBottom: 18 }}>
            {syaikh ? <>disampaikan ke {titel} {syaikh.name}</> : 'belum ada Syaikh/Ustadzah aktif'}
          </p>

          {syaikh && dicekBelumLengkap && (
            <p className="t-small" style={{ marginBottom: 12, color: 'var(--kuning-ink)' }}>
              {titel} {syaikh.name} sudah menilai rekaman yang ada. Rekaman yang belum
              disetor masih bisa dikirim sampai periode ini berakhir — setelah dikirim,
              setoran kembali menunggu pemeriksaan {titel.toLowerCase()}, dan nilai yang
              sudah diberikan tetap tersimpan.
            </p>
          )}

          {syaikh ? (
            <PesertaSetoranForm
              musyrifName={`${titel} ${syaikh.name}`}
              musyrifInitials={initialsOf(syaikh.name)}
              existing={existing}
              endpoint="/api/2in1/setoran-musyrif/submit"
              singleSubmitEndpoint="/api/2in1/setoran-musyrif/submit-single"
              targetRoleLabel={`${titel} Anda`}
              cacheKey={`m-${cycle}`}
              // Kunci periode yang dirender halaman ini: upload yang baru selesai
              // lewat 00:00 di batas periode tetap masuk periode ini, bukan berikutnya.
              periodWeekStart={cycle}
              submittedJenis={currentSubmittedJenis}
              restored={restoredCurrent}
              pesertaName={musyrifName}
              pesertaId={musyrifId}
            />
          ) : (
            <p className="t-body">
              Tidak ada {titel.toLowerCase()} aktif untuk gender ini. Hubungi koordinator.
            </p>
          )}

          {syaikh && backfillCycles.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 className="t-h1" style={{ fontSize: 18, marginBottom: 2 }}>
                Setor periode terlewat
              </h2>
              <p className="t-small" style={{ marginBottom: 14 }}>
                Periode lalu yang belum lengkap. Rekaman bisa dikirim satu per satu
                untuk periode tersebut.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {backfillCycles.map((bc) => (
                  <details key={bc.cycleStart} className="card" style={{ padding: 14 }}>
                    <summary
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        listStyle: 'none',
                      }}
                    >
                      <span style={{ fontSize: 14, fontWeight: 600 }}>Periode {bc.label}</span>
                      <span className="t-small">{bc.submittedJenis.length}/3 · setor →</span>
                    </summary>
                    <div style={{ marginTop: 12 }}>
                      <PesertaSetoranForm
                        musyrifName={`${titel} ${syaikh.name}`}
                        musyrifInitials={initialsOf(syaikh.name)}
                        existing={null}
                        endpoint="/api/2in1/setoran-musyrif/submit"
                        singleSubmitEndpoint="/api/2in1/setoran-musyrif/submit-single"
                        targetRoleLabel={`${titel} Anda`}
                        cacheKey={`m-${bc.cycleStart}`}
                        periodWeekStart={bc.cycleStart}
                        submittedJenis={bc.submittedJenis}
                        pesertaName={musyrifName}
                        pesertaId={musyrifId}
                      />
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
