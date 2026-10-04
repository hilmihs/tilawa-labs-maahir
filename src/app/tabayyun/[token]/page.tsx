import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeHutangForHalaqah } from '@/lib/hits-hutang';
import { hitsHeadlineLabel } from '@/types/db';
import { describePelanggaran } from '@/lib/hits-tabayyun';
import { TabayyunKlarifikasiForm } from '@/components/TabayyunKlarifikasiForm';
import { submitKlarifikasiPublik } from './actions';

export const dynamic = 'force-dynamic';

export default async function TabayyunTokenPage({ params }: { params: { token: string } }) {
  const { token } = params;

  const { data: tab } = await supabaseAdmin
    .from('hits_tabayyun')
    .select(
      `id, kondisi, status, alasan_pengajar, halaqah_id, keterangan_id,
       bayar_menit_klaim, bayar_catatan, izin_selisih_menit,
       pengajar:pengajar_id(name),
       halaqah:halaqah_id(name),
       keterangan:keterangan_id(tanggal, pertemuan_no)`
    )
    .eq('akses_token', token)
    .maybeSingle();

  // 404 netral: jangan bedakan "tidak pernah ada" vs "dicabut".
  if (!tab) notFound();

  const pengajar = tab.pengajar as unknown as { name: string } | null;
  const halaqah = tab.halaqah as unknown as { name: string } | null;
  const ket = tab.keterangan as unknown as { tanggal: string; pertemuan_no: number } | null;

  const { data: pelRows } = await supabaseAdmin
    .from('hits_pelanggaran')
    .select('jenis, menit, jkg_opsi, cicil_n, badal_nama, badal_mulai')
    .eq('keterangan_id', tab.keterangan_id as string);
  // Kode mentah ("JKG") tak berarti bagi pengajar — pakai formatter yang sama
  // dengan pesan WA & kartu koordinator.
  const pelanggaran = (pelRows ?? []).map((p) =>
    describePelanggaran({
      jenis: p.jenis as string,
      menit: (p.menit as number | null) ?? null,
      jkg_opsi: (p.jkg_opsi as string | null) ?? null,
      cicil_n: (p.cicil_n as number | null) ?? null,
      badal_nama: (p.badal_nama as string | null) ?? null,
      badal_mulai: (p.badal_mulai as string | null) ?? null,
    })
  );

  const { saldo } = await computeHutangForHalaqah(tab.halaqah_id as string);
  const decided = tab.status === 'decided';

  async function handleSubmit(fd: FormData) {
    'use server';
    return submitKlarifikasiPublik(token, fd);
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px' }}>
      <h1 className="t-h1" style={{ marginBottom: 4 }}>Tabayyun — Klarifikasi</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {pengajar?.name ?? 'Pengajar'} · {halaqah?.name ?? 'Kelas'} ·{' '}
        {ket ? `Pertemuan ${ket.pertemuan_no} · ${ket.tanggal}` : '—'}
      </p>

      <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16 }}>
        <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
          Tercatat: {tab.kondisi as string} — {hitsHeadlineLabel(tab.kondisi as string)}
        </div>
        <ul className="t-small" style={{ margin: 0, paddingLeft: 18, color: 'var(--muted-2)' }}>
          {pelanggaran.length === 0 ? (
            <li>(rincian tidak tersedia)</li>
          ) : (
            pelanggaran.map((baris, i) => <li key={i}>{baris}</li>)
          )}
        </ul>
      </div>

      {decided ? (
        <div className="card-flat" style={{ padding: '14px 16px' }}>
          <p className="t-small" style={{ marginBottom: 6 }}>
            Tabayyun ini <strong>sudah diputuskan</strong> koordinator. Tautan tidak lagi menerima kiriman.
          </p>
          {tab.alasan_pengajar && (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Klarifikasi Anda: {tab.alasan_pengajar as string}
            </p>
          )}
        </div>
      ) : (
        <div className="card-flat" style={{ padding: '14px 16px' }}>
          <TabayyunKlarifikasiForm
            tabayyunId={tab.id as string}
            saldoHutang={saldo}
            alasanAwal={(tab.alasan_pengajar as string | null) ?? null}
            menitAwal={(tab.bayar_menit_klaim as number | null) ?? null}
            catatanAwal={(tab.bayar_catatan as string | null) ?? null}
            selisihIzinMenit={(tab.izin_selisih_menit as number | null) ?? 0}
            onSubmit={handleSubmit}
          />
        </div>
      )}
    </main>
  );
}
