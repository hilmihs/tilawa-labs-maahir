import type { JenisRekaman, NilaiRekaman } from '@/types/db';

const JENIS_LABEL: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Asy-Syawahid',
};

const JENIS_ORDER: JenisRekaman[] = ['tuhfatul_athfal', 'jazariyyah', 'syawahid'];

export interface RiwayatRekaman {
  jenis: JenisRekaman;
  nilai: NilaiRekaman | null;
  masukan: string | null;
  submitted: boolean; // ada audio_url
}

export interface RiwayatCycle {
  cycleStart: string;
  label: string;
  status: 'submitted' | 'checked';
  rekaman: RiwayatRekaman[];
}

/**
 * Riwayat penilaian musyrif POV peserta: per cycle terlampau (Juni 2026+),
 * tampilkan nilai tiap rekaman + catatan musyrif. Rekaman yang tak disetor
 * ditandai jelas (mempengaruhi rata-rata matrix).
 */
export function RiwayatPenilaian({ cycles }: { cycles: RiwayatCycle[] }) {
  if (!cycles.length) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h2 className="t-h1" style={{ fontSize: 18, marginBottom: 2 }}>
        Riwayat penilaian
      </h2>
      <p className="t-small" style={{ marginBottom: 14 }}>
        Nilai &amp; catatan musyrif untuk periode sebelumnya.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cycles.map((c) => (
          <div key={c.cycleStart} className="card" style={{ padding: 14 }}>
            <div className="rec-head" style={{ marginBottom: 10 }}>
              <div className="title">Periode {c.label}</div>
              {c.status === 'checked' ? (
                <span className="badge badge-hijau">
                  <span className="dot" /> Dinilai
                </span>
              ) : (
                <span className="badge" style={{ color: 'var(--kuning-ink)' }}>
                  <span className="dot" style={{ background: 'var(--kuning)' }} /> Menunggu cek
                </span>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {JENIS_ORDER.map((jenis) => {
                const r = c.rekaman.find((x) => x.jenis === jenis);
                const submitted = !!r?.submitted;
                return (
                  <div
                    key={jenis}
                    style={{
                      borderTop: '1px solid var(--line)',
                      paddingTop: 8,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        {JENIS_LABEL[jenis]}
                      </span>
                      {!submitted ? (
                        <span
                          className="badge badge-merah"
                          title="Tidak disetor — dihitung 0 pada rata-rata"
                        >
                          <span className="dot" /> Tidak disetor
                        </span>
                      ) : r?.nilai ? (
                        <span className={`badge badge-${r.nilai}`}>
                          <span className="dot" />
                          {capitalize(r.nilai)}
                        </span>
                      ) : (
                        <span className="t-small" style={{ fontStyle: 'italic' }}>
                          belum dinilai
                        </span>
                      )}
                    </div>
                    {submitted && r?.masukan && (
                      <p className="t-body" style={{ margin: '4px 0 0' }}>
                        {r.masukan}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
