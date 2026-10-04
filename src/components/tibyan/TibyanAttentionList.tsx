import type { TibyanView } from '@/lib/tibyan-rekap';
import { persenBadgeClass } from '@/lib/status-color';

// Server component — daftar "perlu perhatian": anggota rawan + kelas di bawah target.
export function TibyanAttentionList({
  perhatian,
  target,
}: {
  perhatian: TibyanView['perhatian'];
  target: number;
}) {
  const { anggota, kelas } = perhatian;

  if (anggota.length === 0 && kelas.length === 0) {
    return (
      <div className="banner banner-success" style={{ marginBottom: 8 }}>
        <span className="desc">✅ Semua anggota & kelas di atas target {target}% — tidak ada yang perlu perhatian khusus.</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {kelas.length > 0 && (
        <div>
          <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            Kelas di bawah target ({kelas.length})
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {kelas.map((k, i) => (
              <span key={i} className="badge badge-merah" style={{ whiteSpace: 'nowrap' }}>
                {k.kelasName} · {k.gender === 'ikhwan' ? 'I' : 'A'} — {k.persen}%
              </span>
            ))}
          </div>
        </div>
      )}

      {anggota.length > 0 && (
        <div>
          <div className="t-small" style={{ fontWeight: 600, marginBottom: 6 }}>
            Anggota perlu perhatian ({anggota.length})
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {anggota.map((a) => (
              <div
                key={a.anggotaId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  alignItems: 'baseline',
                  borderBottom: '1px solid var(--surface-3)',
                  paddingBottom: 6,
                }}
              >
                <div>
                  <div className="t-small" style={{ fontWeight: 600 }}>{a.name}</div>
                  <div className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                    {a.kelasName} · {a.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
                  {a.alphaBeruntun >= 2 && (
                    <span className="badge badge-merah" title="Sabtu tanpa keterangan berturut-turut">
                      {a.alphaBeruntun}× alpha beruntun
                    </span>
                  )}
                  <span className={persenBadgeClass(a.persen)}>
                    {a.persen === null ? '—' : `${a.persen}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
