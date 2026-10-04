import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signedAudioUrl } from '@/lib/storage';
import { Icon } from '@/components/icons';
import { formatCycleRangeShort } from '@/lib/week';
import { JENIS_REKAMAN, type JenisRekaman, type MusyrifSession } from '@/types/db';
import { CekSetoranForm, type RekamanView } from '../CekSetoranForm';
import { hitungKelengkapan } from '../kelengkapan';
import { submitCek } from './actions';

// Masa berlaku tautan audio bertanda tangan. Dulu 1 jam — musyrif yang
// memeriksa lama (atau membiarkan tab terbuka) mendapati audio tak bisa
// diputar lagi. 12 jam cukup untuk satu sesi memeriksa.
const AUDIO_URL_TTL_SEC = 12 * 3600;

export const dynamic = 'force-dynamic';

export default async function CekPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  // Lewat accesses, bukan role aktif — pemegang banyak role tetap bisa masuk.
  const akses = (s.accesses ?? (s.session ? [s.session] : [])).find(
    (a) => a.role === 'musyrif'
  ) as MusyrifSession | undefined;
  if (!akses) {
    redirect(`/2in1/musyrif/login?next=/2in1/musyrif/cek/${params.id}`);
  }
  const musyrifId = akses.musyrif_id;

  const { data: setoran } = await supabaseAdmin
    .from('setoran')
    .select(
      'id, status, week_start, submitted_at, peserta:peserta_id(id, name, kelas:kelas_id(id, name, musyrif_id))'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!setoran) {
    return (
      <Wrap>
        <p className="t-body">Setoran tidak ditemukan.</p>
      </Wrap>
    );
  }
  const peserta = setoran.peserta as unknown as {
    id: string;
    name: string;
    kelas: { id: string; name: string; musyrif_id: string };
  };
  if (peserta.kelas.musyrif_id !== musyrifId) {
    return (
      <Wrap>
        <div className="banner banner-error">
          <div>
            <div className="title">Tidak punya akses</div>
            <div className="desc">Setoran ini berasal dari kelas yang bukan Anda ampu.</div>
          </div>
        </div>
      </Wrap>
    );
  }

  const { data: rekaman } = await supabaseAdmin
    .from('rekaman')
    .select('jenis, audio_url, duration_seconds, nilai, masukan')
    .eq('setoran_id', params.id);

  const rekamanByJenis = new Map(
    (rekaman ?? []).map((r) => [r.jenis as JenisRekaman, r])
  );

  const rekamanList: RekamanView[] = await Promise.all(
    JENIS_REKAMAN.map(async (j) => {
      const r = rekamanByJenis.get(j);
      let audioUrl: string | null = null;
      if (r?.audio_url) {
        try {
          audioUrl = await signedAudioUrl(r.audio_url, AUDIO_URL_TTL_SEC);
        } catch {
          audioUrl = null;
        }
      }
      return {
        jenis: j,
        disetor: Boolean(r),
        audioUrl,
        durationSec: r?.duration_seconds ?? null,
        nilai: (r?.nilai ?? null) as RekamanView['nilai'],
        masukan: r?.masukan ?? null,
      };
    })
  );

  const lengkap = hitungKelengkapan(setoran.week_start, rekamanByJenis.keys());
  let catatanKurang: { judul: string; isi: string } | null = null;
  if (lengkap.kurang.length > 0) {
    if (lengkap.ada.length === 0) {
      catatanKurang = {
        judul: 'Belum ada rekaman yang disetor',
        isi: lengkap.lewatBatas
          ? `Periode ini sudah berakhir (${lengkap.batasLabel}) tanpa rekaman.`
          : `Peserta masih bisa menyetor sampai ${lengkap.batasLabel}.`,
      };
    } else if (lengkap.lewatBatas) {
      catatanKurang = {
        judul: 'Setoran tidak lengkap',
        isi: `${lengkap.kurangLabel} tidak disetor sampai periode berakhir (${lengkap.batasLabel}). Nilai rekaman yang ada saja.`,
      };
    } else {
      catatanKurang = {
        judul: 'Setoran belum lengkap',
        isi:
          `${lengkap.kurangLabel} belum disetor. Peserta masih bisa menambahkannya sampai ${lengkap.batasLabel}. ` +
          'Rekaman yang sudah ada boleh dinilai sekarang; begitu peserta menambah rekaman, ' +
          'setoran kembali ke daftar tunggu periksa untuk dinilai lagi.',
      };
    }
  }

  return (
    <Wrap>
      <div className="topbar">
        <Link href="/2in1/musyrif" className="back">
          {Icon.back(12)} dashboard
        </Link>
        <span className="pekan-tag">
          <span className="dot" />
          Periode {formatCycleRangeShort(setoran.week_start)}
        </span>
      </div>
      <div className="page">
        <h1 className="t-h1" style={{ marginBottom: 2 }}>
          Periksa setoran
        </h1>
        <p className="t-small" style={{ marginBottom: 16 }}>
          <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{peserta.name}</strong> ·
          Kelas {peserta.kelas.name}
          {setoran.submitted_at && (
            <> · disetor {formatTime(setoran.submitted_at)}</>
          )}
        </p>
        <CekSetoranForm
          setoranId={setoran.id}
          rekamanList={rekamanList}
          alreadyChecked={setoran.status === 'checked'}
          action={submitCek}
          backHref="/2in1/musyrif"
          forwardLabel="Kirim hasil ke peserta"
          pengirim="peserta"
          catatanKurang={catatanKurang}
        />
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>{children}</div>
    </main>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
