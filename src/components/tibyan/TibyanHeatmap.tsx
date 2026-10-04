import type { RekapKelas, StatusCode } from '@/lib/maahir-rekap';
import { CODE_COLOR, CODE_LABEL, persenBadgeClass } from '@/lib/status-color';
import { SectionHeader } from '@/components/ui/SectionHeader';

// Server component — grid kehadiran At-Tibyan per kelas.
// Baris = anggota, kolom = tiap Sabtu; sel berwarna kode status.

function sabtuLabel(t: string): string {
  return new Date(t + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

const LEGEND: StatusCode[] = ['H', 'T', 'I', 'S', 'A'];

function Cell({ code }: { code: StatusCode }) {
  const isEmpty = code === '-';
  return (
    <span
      title={CODE_LABEL[code]}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 26,
        height: 24,
        borderRadius: 5,
        fontSize: 11,
        fontWeight: 700,
        color: isEmpty ? 'var(--muted-2)' : '#fff',
        background: isEmpty ? 'var(--surface-2)' : CODE_COLOR[code],
      }}
    >
      {code === '-' ? '·' : code}
    </span>
  );
}

export function TibyanHeatmap({ kelasList }: { kelasList: RekapKelas[] }) {
  if (kelasList.length === 0) {
    return (
      <p className="t-small" style={{ color: 'var(--muted-2)' }}>
        Belum ada data At-Tibyan untuk filter ini.
      </p>
    );
  }

  return (
    <div>
      {/* Legenda */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {LEGEND.map((c) => (
          <span key={c} className="t-tiny" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 14, borderRadius: 3, background: CODE_COLOR[c], display: 'inline-block' }} />
            {c} · {CODE_LABEL[c]}
          </span>
        ))}
      </div>

      {kelasList.map((k) => {
        const sessions = k.pertemuan; // sudah terurut tanggal, At-Tibyan-only
        return (
          <div key={k.kelasId} style={{ marginBottom: 28 }}>
            <SectionHeader
              title={k.kelasName}
              style={{ marginBottom: 6 }}
              right={
                <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                  {k.gender === 'ikhwan' ? 'Ikhwan' : 'Akhwat'} · {k.anggota.length} anggota · {sessions.length} sesi
                </span>
              }
            />
            {sessions.length === 0 ? (
              <p className="t-small" style={{ color: 'var(--muted-2)' }}>Belum ada sesi Sabtu terisi.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
                  <thead>
                    <tr>
                      <th
                        style={{
                          position: 'sticky',
                          left: 0,
                          background: 'var(--surface)',
                          textAlign: 'left',
                          fontSize: 11,
                          color: 'var(--muted-2)',
                          minWidth: 130,
                          zIndex: 1,
                        }}
                      >
                        Anggota
                      </th>
                      {sessions.map((s) => (
                        <th key={s.id} className="t-tiny" style={{ color: 'var(--muted-2)', fontWeight: 500, textAlign: 'center' }}>
                          {sabtuLabel(s.tanggal)}
                        </th>
                      ))}
                      <th className="t-tiny" style={{ color: 'var(--muted-2)', textAlign: 'right', paddingLeft: 8 }}>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.anggota.map((a) => (
                      <tr key={a.anggotaId}>
                        <td
                          style={{
                            position: 'sticky',
                            left: 0,
                            background: 'var(--surface)',
                            fontSize: 12,
                            whiteSpace: 'nowrap',
                            maxWidth: 160,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            zIndex: 1,
                          }}
                        >
                          {a.name}
                          {(a.isKetua || a.isWakil) && (
                            <span className="t-tiny" style={{ color: 'var(--muted-2)' }}>
                              {a.isWakil ? ' (wakil)' : ' (ketua)'}
                            </span>
                          )}
                        </td>
                        {sessions.map((s) => (
                          <td key={s.id} style={{ textAlign: 'center' }}>
                            <Cell code={a.perPertemuan[s.id] ?? '-'} />
                          </td>
                        ))}
                        <td style={{ textAlign: 'right', paddingLeft: 8 }}>
                          <span className={persenBadgeClass(a.persenHadir)}>
                            {a.persenHadir === null ? '—' : `${a.persenHadir}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
