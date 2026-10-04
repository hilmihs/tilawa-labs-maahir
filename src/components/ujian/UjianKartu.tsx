import Link from 'next/link';
import { muatPeriodeTerpilih, muatUjianPeserta } from '@/lib/ujian-data';
import { formatRentang, statusPeriode, statusUjianPeserta } from '@/lib/ujian';
import { PredikatTrio, StatusUjianBadge } from '@/components/ujian/UjianBadges';

/** Kartu ujian di dashboard peserta: status + tautan ke halaman ujian. */
export async function UjianKartuPeserta({ pesertaId }: { pesertaId: string }) {
  const { periode, today } = await muatPeriodeTerpilih();
  if (!periode) return null;
  const st = statusPeriode(periode, today);
  const data = (await muatUjianPeserta(periode.id, [pesertaId])).get(pesertaId);
  const stUjian = statusUjianPeserta(data?.ujian);
  const menonjol = st === 'berlangsung' && stUjian === 'belum';

  return (
    <Link href="/2in1/peserta/ujian" style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 16 }}>
      <div
        className="card-flat"
        style={{
          padding: '12px 14px',
          border: menonjol ? '1.5px solid var(--accent)' : undefined,
          background: menonjol ? 'var(--accent-tint)' : undefined,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {periode.nama}
            {st === 'berlangsung' ? ' — sedang berlangsung' : st === 'akan' ? ' — akan datang' : ''}
          </div>
          <div className="t-tiny">
            {formatRentang(periode.mulai, periode.selesai)}
            {menonjol ? ' · rekam ujian sekarang →' : ' · lihat detail →'}
          </div>
        </div>
        {stUjian === 'dinilai' && data ? <PredikatTrio rekaman={data.rekaman} /> : <StatusUjianBadge status={stUjian} />}
      </div>
    </Link>
  );
}

/** Kartu ujian di dashboard musyrif: hitungan peserta per status. */
export async function UjianKartuMusyrif({ pesertaIds }: { pesertaIds: string[] }) {
  const { periode, today } = await muatPeriodeTerpilih();
  if (!periode) return null;
  const st = statusPeriode(periode, today);
  const map = await muatUjianPeserta(periode.id, pesertaIds);
  let belum = 0;
  let menunggu = 0;
  let dinilai = 0;
  for (const id of pesertaIds) {
    const s = statusUjianPeserta(map.get(id)?.ujian);
    if (s === 'dinilai') dinilai++;
    else if (s === 'menunggu') menunggu++;
    else belum++;
  }

  return (
    <Link href="/2in1/musyrif/ujian" style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 16 }}>
      <div
        className="card-flat"
        style={{
          padding: '12px 14px',
          border: menunggu > 0 || st === 'berlangsung' ? '1.5px solid var(--accent)' : undefined,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {periode.nama}
              {st === 'berlangsung' ? ' — berlangsung' : st === 'akan' ? ' — akan datang' : ''}
            </div>
            <div className="t-tiny">{formatRentang(periode.mulai, periode.selesai)} · nilai &amp; keterangan →</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-merah" style={{ fontSize: 10 }}>
            <span className="dot" />
            {belum} belum ujian
          </span>
          <span className="badge badge-kuning" style={{ fontSize: 10 }}>
            <span className="dot" />
            {menunggu} perlu dinilai
          </span>
          <span className="badge badge-hijau" style={{ fontSize: 10 }}>
            <span className="dot" />
            {dinilai} dinilai
          </span>
        </div>
      </div>
    </Link>
  );
}
