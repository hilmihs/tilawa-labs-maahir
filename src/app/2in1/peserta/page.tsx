import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  PesertaSetoranForm,
  type ExistingSetoran,
} from '@/components/PesertaSetoranForm';
import { Icon } from '@/components/icons';
import {
  RiwayatPenilaian,
  type RiwayatCycle,
} from '@/components/RiwayatPenilaian';
import { LogoutButton } from '@/components/LogoutButton';
import { FiturHeader, FiturIdentitas, ChipPeriode } from '@/components/FiturHeader';
import { UjianKartuPeserta } from '@/components/ujian/UjianKartu';
import {
  CYCLE_ANCHOR,
  allCyclesSinceAnchor,
  currentCycleStart,
  formatCycleRange,
} from '@/lib/week';
import { formatCycleRangeShort } from '@/lib/week';
import { findKetuaWakilKelas } from '@/lib/program-kelas';
import { buildWaMeUrl, musyrifTitle, tplPesertaSubmitToMusyrif } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { signedAudioUrl } from '@/lib/storage';
import type { JenisRekaman, NilaiRekaman } from '@/types/db';

export const dynamic = 'force-dynamic';

/** Periode pertama yang setoran dinilai-tapi-belum-lengkapnya boleh disusulkan. */
const SUSULAN_DINILAI_MULAI = '2026-08-24';

export default async function PesertaPage() {
  const s = await getSession();
  if (!s.session || s.session.role !== 'peserta') redirect('/');
  const session = s.session;

  const { data: kelas } = await supabaseAdmin
    .from('kelas')
    .select('id, name, musyrif:musyrif_id(id, name, gender, whatsapp_number)')
    .eq('id', session.kelas_id)
    .maybeSingle();

  // Ketua banner: cek apakah peserta ini ketua/wakil kelas program Maahir
  const { data: me } = await supabaseAdmin
    .from('peserta')
    .select('whatsapp_number, name')
    .eq('id', session.peserta_id)
    .maybeSingle();
  const displayName = me?.name ?? session.name;
  let isKetua = false;
  let pertemuanHariIni: { id: string; nama_kegiatan: string } | null = null;
  if (me?.whatsapp_number) {
    // Kelas yang sudah bubar disaring di findKetuaWakilKelas — banner ketua tak
    // boleh muncul lagi untuk kelas yang seluruh anggotanya sudah selesai.
    const myProgramKelas = await findKetuaWakilKelas(me.whatsapp_number);
    isKetua = myProgramKelas.length > 0;
    if (isKetua) {
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const { data: todayPertemuan } = await supabaseAdmin
        .from('pertemuan_program')
        .select('id, nama_kegiatan')
        .in('program_kelas_id', myProgramKelas.map((k) => k.id))
        .eq('tanggal', todayStr)
        .limit(1)
        .maybeSingle();
      pertemuanHariIni = todayPertemuan ?? null;
    }
  }

  const musyrif = kelas?.musyrif as
    | { id: string; name: string; gender: 'ikhwan' | 'akhwat'; whatsapp_number: string }
    | undefined;

  const week = currentCycleStart();

  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select('id, status')
    .eq('peserta_id', session.peserta_id)
    .eq('week_start', week)
    .maybeSingle();

  let existing: ExistingSetoran | null = null;
  if (setoran && (setoran.status === 'submitted' || setoran.status === 'checked')) {
    const { data: rekaman } = await supabaseAdmin
      .from('rekaman')
      .select('jenis, nilai, masukan')
      .eq('setoran_id', setoran.id);

    let musyrifWaUrl: string | null = null;
    if (setoran.status === 'submitted' && musyrif) {
      const cekUrl = absUrl(`/2in1/musyrif/cek/${setoran.id}`);
      const waText = tplPesertaSubmitToMusyrif({
        pesertaName: displayName,
        pesertaGender: session.gender,
        kelasName: kelas?.name ?? '',
        musyrifGender: musyrif.gender,
        cekUrl,
      });
      musyrifWaUrl = buildWaMeUrl(musyrif.whatsapp_number, waText);
    }

    existing = {
      id: setoran.id,
      status: setoran.status,
      musyrifWaUrl,
      rekaman: (rekaman ?? []).map((r) => ({
        jenis: r.jenis as JenisRekaman,
        nilai: (r.nilai as NilaiRekaman | null) ?? null,
        masukan: r.masukan ?? null,
      })),
    };
  }

  // --- Riwayat + backfill periode lampau (Juni 2026+) ---
  const allCycles = allCyclesSinceAnchor();
  const { data: allSetoran } = await supabaseAdmin
    .from('setoran')
    .select('id, week_start, status')
    .eq('peserta_id', session.peserta_id)
    .gte('week_start', CYCLE_ANCHOR);
  const setoranIds = (allSetoran ?? []).map((s) => s.id);
  const { data: allRekaman } = setoranIds.length
    ? await supabaseAdmin
        .from('rekaman')
        .select('setoran_id, jenis, nilai, masukan, audio_url, duration_seconds, recorded_at')
        .in('setoran_id', setoranIds)
    : { data: [] };

  type RekRow = {
    setoran_id: string;
    jenis: JenisRekaman;
    nilai: NilaiRekaman | null;
    masukan: string | null;
    audio_url: string | null;
    duration_seconds: number | null;
    recorded_at: string | null;
  };
  const rekamanBySetoran = new Map<string, RekRow[]>();
  for (const r of (allRekaman ?? []) as RekRow[]) {
    const arr = rekamanBySetoran.get(r.setoran_id) ?? [];
    arr.push(r);
    rekamanBySetoran.set(r.setoran_id, arr);
  }
  const setoranByCycle = new Map(
    (allSetoran ?? []).map((s) => [s.week_start as string, s])
  );

  // Pulihkan rekaman cycle berjalan dari server (anti-hilang saat refresh / ganti HP).
  const curSetoran = setoranByCycle.get(week);
  const curReks = curSetoran ? rekamanBySetoran.get(curSetoran.id) ?? [] : [];
  const currentSubmittedJenis: JenisRekaman[] = curReks
    .filter((r) => r.audio_url)
    .map((r) => r.jenis);
  // `recordedAt` = waktu rekaman server terakhir di-upload. Ikut dikirim agar
  // form bisa membandingkannya dengan draf IndexedDB (draf lebih baru = rekam
  // ulang yang uploadnya gagal → jangan ditimpa rekaman server yang lama).
  const restoredCurrent: Partial<
    Record<JenisRekaman, { audioUrl: string; durationSec: number; recordedAt: string | null }>
  > = {};
  for (const r of curReks) {
    if (r.audio_url) {
      try {
        restoredCurrent[r.jenis] = {
          audioUrl: await signedAudioUrl(r.audio_url, 86400),
          durationSec: r.duration_seconds ?? 0,
          recordedAt: r.recorded_at ?? null,
        };
      } catch {
        // storage error — audio tidak bisa dipulihkan, peserta bisa rekam ulang
      }
    }
  }

  // Periode lampau (selain cycle berjalan) yang belum dicek & belum lengkap (<3
  // rekaman ber-audio) → bisa di-backfill peserta.
  const backfillCycles: Array<{
    cycleStart: string;
    label: string;
    submittedJenis: JenisRekaman[];
    /** Diisi bila setoran periode itu sudah dinilai: jenis bernilai tampil hanya-baca. */
    existing: ExistingSetoran | null;
  }> = [];
  // Periode lampau yang sudah disetor (submitted/checked) → tampil di riwayat.
  const riwayatCycles: RiwayatCycle[] = [];

  for (const cycle of allCycles) {
    if (cycle === week) continue; // cycle berjalan ditangani form utama
    const s = setoranByCycle.get(cycle);
    const reks = s ? rekamanBySetoran.get(s.id) ?? [] : [];
    const submittedJenis = reks.filter((r) => r.audio_url).map((r) => r.jenis);
    const status = s?.status as 'draft' | 'submitted' | 'checked' | undefined;

    // Setoran yang sudah dinilai tapi belum lengkap boleh disusulkan (server
    // membukanya kembali ke 'submitted', nilai yang ada tetap) — dibatasi mulai
    // periode yang mencakup September 2026; periode lebih lama dibiarkan.
    const bolehSusul = status !== 'checked' || cycle >= SUSULAN_DINILAI_MULAI;
    if (bolehSusul && submittedJenis.length < 3) {
      backfillCycles.push({
        cycleStart: cycle,
        label: formatCycleRange(cycle),
        submittedJenis,
        existing:
          s && status === 'checked'
            ? {
                id: s.id,
                status: 'checked',
                musyrifWaUrl: null,
                rekaman: reks.map((r) => ({
                  jenis: r.jenis as JenisRekaman,
                  nilai: (r.nilai as NilaiRekaman | null) ?? null,
                  masukan: r.masukan ?? null,
                })),
              }
            : null,
      });
    }
    if ((status === 'submitted' || status === 'checked') && submittedJenis.length > 0) {
      riwayatCycles.push({
        cycleStart: cycle,
        label: formatCycleRange(cycle),
        status,
        rekaman: reks.map((r) => ({
          jenis: r.jenis,
          nilai: r.nilai,
          masukan: r.masukan,
          submitted: !!r.audio_url,
        })),
      });
    }
  }
  // Riwayat: terbaru dulu. Backfill: terlama dulu (lunasi yang paling lama).
  riwayatCycles.reverse();

  // Periode tepat sebelum cycle berjalan. Kalau belum lengkap, peserta yang baru
  // saja melewati pergantian periode (mis. upload selesai lewat 00:00) perlu
  // diingatkan di atas — jangan sampai ia merekam ulang di periode baru.
  const periodeSebelumnya = allCycles.length >= 2 ? allCycles[allCycles.length - 2] : null;
  const tunggakanTerakhir = periodeSebelumnya
    ? backfillCycles.find((bc) => bc.cycleStart === periodeSebelumnya) ?? null
    : null;

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <FiturHeader
          ikon="mic"
          judul="Barnamij 2in1"
          sub="Setoran hafalan Tuhfah, Jazariyyah, Syawahid"
          kanan={
            <>
              <Link href="/akun" className="btn btn-sm btn-ghost">
                Akun
              </Link>
              <LogoutButton />
            </>
          }
        >
          <FiturIdentitas
            inisial={initialsOf(displayName)}
            label="Peserta"
            nama={displayName}
            kanan={<ChipPeriode>{formatCycleRangeShort(week)}</ChipPeriode>}
          />
        </FiturHeader>

        <div className="page">
          {isKetua && (
            <Link
              href={pertemuanHariIni ? `/2in1/ketua-kelas/pertemuan/${pertemuanHariIni.id}` : '/2in1/ketua-kelas'}
              style={{ textDecoration: 'none', display: 'block', marginBottom: 16 }}
            >
              <div style={{
                background: pertemuanHariIni ? 'var(--accent-tint)' : 'var(--surface)',
                border: `1.5px solid ${pertemuanHariIni ? 'var(--accent)' : 'var(--line)'}`,
                borderRadius: 10,
                padding: '10px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: pertemuanHariIni ? 'var(--accent-2)' : 'var(--muted-2)' }}>
                    {pertemuanHariIni ? `Ada pertemuan hari ini: ${pertemuanHariIni.nama_kegiatan}` : 'Ketua Kelas 2in1'}
                  </div>
                  <div className="t-tiny">
                    {pertemuanHariIni ? 'Isi kehadiran →' : 'Catat pertemuan & kehadiran'}
                  </div>
                </div>
                <span style={{ fontSize: 18 }}>→</span>
              </div>
            </Link>
          )}

          <UjianKartuPeserta pesertaId={session.peserta_id} />

          {musyrif && tunggakanTerakhir && (
            <a
              href={`#setor-periode-${tunggakanTerakhir.cycleStart}`}
              className="banner"
              style={{
                textDecoration: 'none',
                marginBottom: 18,
                background: 'var(--kuning-tint)',
                borderColor: 'var(--kuning)',
                borderWidth: 1.5,
                alignItems: 'center',
              }}
            >
              <span
                className="ic"
                style={{ background: 'var(--kuning)', color: '#fff', fontWeight: 800 }}
                aria-hidden
              >
                !
              </span>
              <span style={{ flex: 1 }}>
                <span className="title" style={{ display: 'block' }}>
                  Setoran periode {tunggakanTerakhir.label} belum lengkap —{' '}
                  {tunggakanTerakhir.submittedJenis.length}/3 terkirim.
                </span>
                <span className="desc" style={{ display: 'block', color: 'var(--kuning-ink)' }}>
                  Lengkapi di bawah →
                </span>
              </span>
            </a>
          )}

          <h1 className="t-h1" style={{ marginBottom: 2 }}>
            Setoran cycle ini
          </h1>
          <p className="t-small" style={{ marginBottom: 18 }}>
            Kelas {kelas?.name ?? '—'}
            {musyrif && <> · disampaikan ke {musyrif.name}</>}
          </p>

          {musyrif ? (
            <PesertaSetoranForm
              musyrifName={musyrif.name}
              musyrifInitials={initialsOf(musyrif.name)}
              existing={existing}
              targetRoleLabel={`${musyrifTitle(musyrif.gender)} kelas Anda`}
              endpoint="/api/2in1/setoran/submit"
              singleSubmitEndpoint="/api/2in1/rekaman/submit-single"
              cacheKey={week}
              // Kunci periode yang dirender halaman ini: upload yang baru selesai
              // lewat 00:00 di batas periode tetap masuk periode ini, bukan berikutnya.
              periodWeekStart={week}
              submittedJenis={currentSubmittedJenis}
              restored={restoredCurrent}
              pesertaName={displayName}
              pesertaId={session.peserta_id}
              kelasName={kelas?.name}
            />
          ) : (
            <p className="t-body">
              Belum ada musyrif untuk kelas Anda. Hubungi koordinator.
            </p>
          )}

          {musyrif && backfillCycles.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <h2 className="t-h1" style={{ fontSize: 18, marginBottom: 2 }}>
                Setor periode terlewat
              </h2>
              <p className="t-small" style={{ marginBottom: 14 }}>
                Periode lalu yang belum lengkap. Boleh kirim walau hanya 1 rekaman —
                rekaman yang tak disetor dihitung 0 pada rata-rata.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {backfillCycles.map((bc) => (
                  <details
                    key={bc.cycleStart}
                    id={`setor-periode-${bc.cycleStart}`}
                    className="card"
                    style={{ padding: 14, scrollMarginTop: 16 }}
                    // Periode tepat sebelumnya yang belum lengkap langsung terbuka.
                    open={bc.cycleStart === tunggakanTerakhir?.cycleStart}
                  >
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
                      <span style={{ fontSize: 14, fontWeight: 600 }}>
                        Periode {bc.label}
                      </span>
                      <span className="t-small">
                        {bc.submittedJenis.length}/3 · setor →
                      </span>
                    </summary>
                    <div style={{ marginTop: 12 }}>
                      <PesertaSetoranForm
                        musyrifName={musyrif.name}
                        musyrifInitials={initialsOf(musyrif.name)}
                        existing={bc.existing}
                        targetRoleLabel={`${musyrifTitle(musyrif.gender)} kelas Anda`}
                        endpoint="/api/2in1/setoran/submit"
                        singleSubmitEndpoint="/api/2in1/rekaman/submit-single"
                        cacheKey={bc.cycleStart}
                        periodWeekStart={bc.cycleStart}
                        submittedJenis={bc.submittedJenis}
                        pesertaName={displayName}
                        pesertaId={session.peserta_id}
                        kelasName={kelas?.name}
                      />
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}

          <RiwayatPenilaian cycles={riwayatCycles} />
        </div>
      </div>
    </main>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}
