import { JENIS_REKAMAN, type JenisRekaman, type PredikatUjian } from '@/types/db';
import {
  PREDIKAT_LABEL,
  PREDIKAT_WARNA,
  STATUS_UJIAN_LABEL,
  type StatusPeriode,
  type StatusUjianPeserta,
} from '@/lib/ujian';

export const JENIS_LABEL_UJIAN: Record<JenisRekaman, string> = {
  tuhfatul_athfal: 'Tuhfatul Athfal',
  jazariyyah: 'Al-Jazariyyah',
  syawahid: 'Asy-Syawahid',
};

export function PredikatBadge({ predikat, small }: { predikat: PredikatUjian | null; small?: boolean }) {
  if (!predikat) {
    return (
      <span className="badge badge-neutral" style={small ? { fontSize: 10 } : undefined}>
        <span className="dot" />
        belum dinilai
      </span>
    );
  }
  return (
    <span className={`badge badge-${PREDIKAT_WARNA[predikat]}`} style={small ? { fontSize: 10 } : undefined}>
      <span className="dot" />
      {PREDIKAT_LABEL[predikat]}
    </span>
  );
}

/** Tiga titik berurutan Tuhfah · Jazariyyah · Syawahid; abu-abu bila belum ada predikat. */
export function PredikatTrio({ rekaman }: { rekaman: Array<{ jenis: JenisRekaman; predikat: PredikatUjian | null }> }) {
  const by = new Map(rekaman.map((r) => [r.jenis, r.predikat]));
  return (
    <span className="nilai-trio">
      {JENIS_REKAMAN.map((j) => {
        const p = by.get(j) ?? null;
        return (
          <span
            key={j}
            className={`d ${p ? PREDIKAT_WARNA[p] : ''}`}
            title={`${JENIS_LABEL_UJIAN[j]}: ${p ? PREDIKAT_LABEL[p] : '—'}`}
          />
        );
      })}
    </span>
  );
}

export function StatusUjianBadge({ status }: { status: StatusUjianPeserta }) {
  const cls = status === 'dinilai' ? 'badge-hijau' : status === 'menunggu' ? 'badge-kuning' : 'badge-merah';
  return (
    <span className={`badge ${cls}`}>
      <span className="dot" />
      {STATUS_UJIAN_LABEL[status].toLowerCase()}
    </span>
  );
}

export function StatusPeriodeBadge({ status }: { status: StatusPeriode }) {
  if (status === 'berlangsung') {
    return (
      <span className="badge badge-hijau">
        <span className="dot" />
        sedang berlangsung
      </span>
    );
  }
  if (status === 'akan') {
    return (
      <span className="badge badge-kuning">
        <span className="dot" />
        akan datang
      </span>
    );
  }
  return (
    <span className="badge badge-neutral">
      <span className="dot" />
      sudah berakhir
    </span>
  );
}

export function LegendaPredikat() {
  return (
    <p className="t-small" style={{ margin: 0 }}>
      <span style={{ color: 'var(--hijau-ink)', fontWeight: 600 }}>Hijau</span>: Mumtaz ·{' '}
      <span style={{ color: 'var(--kuning-ink)', fontWeight: 600 }}>Kuning</span>: Jayyid ·{' '}
      <span style={{ color: 'var(--merah-ink)', fontWeight: 600 }}>Merah</span>: Maqbul &amp; Dha&rsquo;if
    </p>
  );
}
