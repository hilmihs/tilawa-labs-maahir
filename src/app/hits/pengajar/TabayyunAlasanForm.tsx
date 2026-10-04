'use client';

import { submitAlasanTabayyun } from './actions';
import { hitsHeadlineLabel } from '@/types/db';
import { TabayyunKlarifikasiForm } from '@/components/TabayyunKlarifikasiForm';

export type TabayyunForPengajar = {
  id: string;
  halaqah_name: string;
  kondisi: string;
  tanggal: string;
  pertemuan_no: number;
  status: string;
  alasan_pengajar: string | null;
  saldo_hutang: number;
  bayar_menit_klaim: number | null;
  bayar_catatan: string | null;
  izin_selisih_menit: number;
};

function OneTabayyun({ t }: { t: TabayyunForPengajar }) {
  const sudahKirim = t.status === 'awaiting_reason' || t.status === 'decided';

  async function handleSubmit(fd: FormData) {
    return submitAlasanTabayyun(undefined, fd);
  }

  return (
    <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{t.halaqah_name}</div>
        <span className="badge" style={{ background: 'var(--kuning-tint)', borderColor: 'var(--kuning-line)', color: 'var(--kuning-ink)' }}>
          {t.kondisi}
        </span>
      </div>
      <div className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
        Pertemuan {t.pertemuan_no} · {t.tanggal} · {hitsHeadlineLabel(t.kondisi)}
      </div>
      {t.status === 'decided' ? (
        <div className="t-small" style={{ color: 'var(--hijau-ink)' }}>
          ✓ Sudah diputuskan koordinator.
        </div>
      ) : (
        <>
          {sudahKirim && (
            <div className="t-small" style={{ color: 'var(--hijau-ink)', marginBottom: 8 }}>
              ✓ Klarifikasi sudah terkirim · masih bisa direvisi selama belum diputuskan.
            </div>
          )}
          <TabayyunKlarifikasiForm
            tabayyunId={t.id}
            saldoHutang={t.saldo_hutang}
            alasanAwal={t.alasan_pengajar}
            menitAwal={t.bayar_menit_klaim}
            catatanAwal={t.bayar_catatan}
            selisihIzinMenit={t.izin_selisih_menit}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </div>
  );
}

export function TabayyunAlasanPanel({ items }: { items: TabayyunForPengajar[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 className="t-h2" style={{ marginBottom: 4 }}>Tabayyun — Klarifikasi Kondisi Kelas ({items.length})</h2>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 12 }}>
        Kondisi kelas tercatat tidak ideal. Mohon sampaikan alasan/klarifikasi.
      </p>
      {items.map((t) => <OneTabayyun key={t.id} t={t} />)}
    </div>
  );
}
