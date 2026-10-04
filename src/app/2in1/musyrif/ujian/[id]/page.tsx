import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { signedAudioUrl } from '@/lib/storage';
import { Icon } from '@/components/icons';
import { JENIS_LABEL_UJIAN, LegendaPredikat } from '@/components/ujian/UjianBadges';
import { formatRentang } from '@/lib/ujian';
import { JENIS_REKAMAN, type JenisRekaman, type PredikatUjian } from '@/types/db';
import { NilaiUjianForm, type RekamanUjianView } from './NilaiUjianForm';

export const dynamic = 'force-dynamic';

export default async function NilaiUjianPage({ params }: { params: { id: string } }) {
  const s = await getSession();
  if (!s.session || s.session.role !== 'musyrif') {
    redirect(`/2in1/musyrif/login?next=/2in1/musyrif/ujian/${params.id}`);
  }
  const musyrifId = s.session.musyrif_id;

  const { data: ujian } = await supabaseAdmin
    .from('ujian')
    .select(
      'id, status, submitted_at, periode:periode_id(id, nama, mulai, selesai), peserta:peserta_id(id, name, kelas:kelas_id(id, name, musyrif_id))'
    )
    .eq('id', params.id)
    .maybeSingle();

  if (!ujian) {
    return (
      <Wrap>
        <p className="t-body">Ujian tidak ditemukan.</p>
      </Wrap>
    );
  }
  const peserta = ujian.peserta as unknown as {
    id: string;
    name: string;
    kelas: { id: string; name: string; musyrif_id: string };
  };
  const periode = ujian.periode as unknown as { id: string; nama: string; mulai: string; selesai: string };
  if (peserta.kelas.musyrif_id !== musyrifId) {
    return (
      <Wrap>
        <div className="banner banner-error">
          <div>
            <div className="title">Tidak punya akses</div>
            <div className="desc">Ujian ini berasal dari kelas yang bukan Anda ampu.</div>
          </div>
        </div>
      </Wrap>
    );
  }

  const { data: rekaman } = await supabaseAdmin
    .from('rekaman_ujian')
    .select('jenis, audio_url, duration_seconds, predikat, masukan')
    .eq('ujian_id', params.id);
  const byJenis = new Map((rekaman ?? []).map((r) => [r.jenis as JenisRekaman, r]));

  const rekamanList: RekamanUjianView[] = await Promise.all(
    JENIS_REKAMAN.map(async (j) => {
      const r = byJenis.get(j);
      let audioUrl: string | null = null;
      if (r?.audio_url) {
        try {
          audioUrl = await signedAudioUrl(r.audio_url, 3600);
        } catch {
          audioUrl = null;
        }
      }
      return {
        jenis: j,
        label: JENIS_LABEL_UJIAN[j],
        audioUrl,
        adaRekaman: !!r?.audio_url,
        durationSec: r?.duration_seconds ?? null,
        predikat: (r?.predikat ?? null) as PredikatUjian | null,
        masukan: r?.masukan ?? null,
      };
    })
  );

  return (
    <Wrap>
      <div className="topbar">
        <Link href={`/2in1/musyrif/ujian?periode=${periode.id}`} className="back">
          {Icon.back(12)} daftar ujian
        </Link>
        <span className="pekan-tag">
          <span className="dot" />
          {formatRentang(periode.mulai, periode.selesai)}
        </span>
      </div>
      <div className="page">
        <h1 className="t-h1" style={{ marginBottom: 2 }}>
          Nilai ujian
        </h1>
        <p className="t-small" style={{ marginBottom: 8 }}>
          <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{peserta.name}</strong> · Kelas {peserta.kelas.name} ·{' '}
          {periode.nama}
        </p>
        <div style={{ marginBottom: 14 }}>
          <LegendaPredikat />
        </div>
        {ujian.status === 'draft' && (
          <div className="card-flat" style={{ padding: 14, marginBottom: 12 }}>
            <p className="t-small" style={{ margin: 0 }}>
              Peserta belum mengirim rekaman. Bila sudah diujikan langsung (telepon/tatap muka), isi predikat matan
              yang diujikan; matan yang tidak diujikan biarkan kosong.
            </p>
          </div>
        )}
        <NilaiUjianForm ujianId={ujian.id} rekamanList={rekamanList} sudahDinilai={ujian.status === 'checked'} />
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
