'use client';

import { useState, useTransition } from 'react';
import { decideTabayyun, reminderTabayyunPengajar, escalateTabayyunGhosting } from './actions';
import { hitsHeadlineLabel } from '@/types/db';
import { tabayyunGhostingState, tabayyunHoursLeft } from '@/lib/hits-tabayyun';

interface Props {
  tabayyun: {
    id: string;
    pengajar_id: string;
    pengajar_name: string;
    kelas_name: string;
    tanggal: string;
    kondisi: string;
    alasan_pengajar: string | null;
    status: string;
    deadline_at: string;
    reminder_sent_at: string | null;
    bayar_menit_klaim: number | null;
    bayar_catatan: string | null;
    bayar_menit_disetujui: number | null;
    /** Menit observasi − menit yang dilaporkan lewat izin pra-kelas. */
    izin_selisih_menit: number;
    /** Kredit untuk pertemuan ini yang sudah dilaporkan ketua kelas. */
    bayar_menit_ketua: number;
  };
}

export function TabayyunCard({ tabayyun: t }: Props) {
  const [decided, setDecided] = useState(t.status === 'decided');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [reminderPending, startReminderTransition] = useTransition();

  if (decided) {
    return (
      <div id={`tab-${t.id}`} className="card-flat" style={{ padding: '12px 16px', marginBottom: 8, opacity: 0.6, scrollMarginTop: 80 }}>
        <div className="t-small" style={{ fontWeight: 600 }}>
          {t.pengajar_name} — {t.kelas_name}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.tanggal} &bull; {t.kondisi} &bull; Sudah diputuskan
        </div>
      </div>
    );
  }

  const nowIso = new Date().toISOString();
  const state = tabayyunGhostingState(
    { status: t.status, reminder_sent_at: t.reminder_sent_at, deadline_at: t.deadline_at },
    nowIso
  );
  const hoursLeft = tabayyunHoursLeft(
    { status: t.status, reminder_sent_at: t.reminder_sent_at, deadline_at: t.deadline_at },
    nowIso
  );

  function handleDecide(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await decideTabayyun(undefined, fd);
      if (result?.error) { setError(result.error); return; }
      if (result?.ok) setDecided(true);
    });
  }

  function handleReminder() {
    setError(null);
    startReminderTransition(async () => {
      const result = await reminderTabayyunPengajar(t.id);
      if (result.error) { setError(result.error); return; }
      if (result.waUrl) window.open(result.waUrl, '_blank');
    });
  }

  function handleEscalate() {
    setError(null);
    startReminderTransition(async () => {
      const result = await escalateTabayyunGhosting(t.id);
      if (result.error) { setError(result.error); return; }
      if (result.waUrl) window.open(result.waUrl, '_blank');
      setDecided(true);
    });
  }

  return (
    <div id={`tab-${t.id}`} className="card-flat" style={{ padding: '14px 16px', marginBottom: 8, scrollMarginTop: 80 }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.pengajar_name}</div>
          {state === 'ghosting' ? (
            <button
              onClick={handleEscalate}
              disabled={reminderPending}
              className="act-btn"
              style={{ fontSize: 11, flexShrink: 0, background: 'var(--merah-ink)', color: '#fff' }}
            >
              {reminderPending ? '...' : 'Teguran Ghosting'}
            </button>
          ) : (state === 'not_reminded' || state === 'awaiting_within') ? (
            <button
              onClick={handleReminder}
              disabled={reminderPending}
              className="act-btn wa"
              style={{ fontSize: 11, flexShrink: 0 }}
            >
              {reminderPending ? '...' : state === 'not_reminded' ? 'Reminder Tabayyun' : 'Ingatkan Lagi'}
            </button>
          ) : null}
        </div>
        <div className="t-small" style={{ color: 'var(--muted-2)' }}>
          {t.kelas_name} &bull; {t.tanggal} &bull;{' '}
          <span style={{ color: 'var(--kuning-ink)', fontWeight: 600 }}>
            {t.kondisi} — {hitsHeadlineLabel(t.kondisi)}
          </span>
        </div>
        {t.alasan_pengajar && (
          <div className="t-small" style={{ marginTop: 6, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}>
            <strong>Alasan pengajar:</strong> {t.alasan_pengajar}
          </div>
        )}
        {!t.alasan_pengajar && t.status === 'pending' && (
          <div className="t-small" style={{ marginTop: 6, color: 'var(--muted)' }}>
            Pengajar belum memberikan alasan.
          </div>
        )}
        {state === 'not_reminded' && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--muted-2)' }}>
            Jam 72 jam mulai setelah reminder dikirim.
          </div>
        )}
        {state === 'awaiting_within' && hoursLeft != null && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--muted-2)' }}>
            Deadline: {new Date(t.deadline_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} &bull; sisa ~{Math.max(0, Math.floor(hoursLeft))} jam
          </div>
        )}
        {state === 'ghosting' && hoursLeft != null && (
          <div className="t-small" style={{ marginTop: 4, color: 'var(--merah-ink)', fontWeight: 700 }}>
            ⚠ GHOSTING — tenggat lewat ~{Math.abs(Math.floor(hoursLeft))} jam. Terbitkan teguran.
          </div>
        )}
      </div>

      <form action={handleDecide}>
        <input type="hidden" name="tabayyun_id" value={t.id} />
        {t.izin_selisih_menit > 0 && (
          <div
            className="t-small"
            style={{
              marginBottom: 8,
              padding: '8px 10px',
              background: 'var(--kuning-tint)',
              border: '1px solid var(--kuning-line)',
              borderRadius: 6,
              color: 'var(--kuning-ink)',
              fontWeight: 600,
            }}
          >
            Izin pra-kelas tidak menutupi seluruh catatan observasi — selisih {t.izin_selisih_menit} menit.
          </div>
        )}

        {t.bayar_menit_klaim != null && (
          <div
            className="t-small"
            style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 6 }}
          >
            <div>
              <strong>Klaim pengajar:</strong> menunaikan {t.bayar_menit_klaim} menit di pertemuan ini.
            </div>
            {t.bayar_catatan && <div style={{ color: 'var(--muted-2)' }}>Catatan: {t.bayar_catatan}</div>}
            {t.bayar_menit_ketua > 0 && (
              <div style={{ color: 'var(--kuning-ink)', fontWeight: 600, marginTop: 4 }}>
                ⚠ Ketua kelas sudah melaporkan {t.bayar_menit_ketua} menit untuk pertemuan ini — jangan dihitung dua kali.
              </div>
            )}
          </div>
        )}

        {t.bayar_menit_klaim != null && (
          <label className="t-small" style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontWeight: 600 }}>Menit disetujui</span>
            <input
              name="bayar_menit_disetujui"
              type="number"
              min={0}
              step={1}
              defaultValue={t.bayar_menit_disetujui ?? t.bayar_menit_klaim ?? 0}
              className="input"
              style={{ height: 36, fontSize: 13, marginTop: 4 }}
            />
          </label>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="true" required />
            <span className="t-small" style={{ fontWeight: 500 }}>Udzur syar&apos;i (diterima)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="radio" name="is_udzur_syari" value="false" />
            <span className="t-small" style={{ fontWeight: 500 }}>Tidak diterima</span>
          </label>
        </div>

        <input
          name="keputusan_catatan"
          className="input"
          placeholder="Catatan keputusan (opsional)"
          style={{ height: 36, fontSize: 13, marginBottom: 8 }}
        />

        {error && <p className="t-small" style={{ color: 'var(--danger)', marginBottom: 4 }}>{error}</p>}

        <button type="submit" className="btn btn-sm" disabled={pending} style={{ width: '100%' }}>
          {pending ? 'Menyimpan...' : 'Putuskan'}
        </button>
      </form>
    </div>
  );
}
