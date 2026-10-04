'use client';

import { useState, useEffect } from 'react';
import { ADMIN_WA } from '@/lib/constants';
import { readLastErrorDiag } from '@/lib/error-diag';

interface UserInfo {
  name: string;
  role: string;
  roleLabel: string;
  dashboardPath: string;
  whatsappNumber?: string;
}

const ROLE_LABELS: Record<string, string> = {
  peserta: 'Peserta',
  musyrif: 'Musyrif',
  koordinator: 'Koordinator',
  syaikh: 'Syaikh',
  pengajar: 'Pengajar',
  ketua_kelas: 'Ketua Kelas',
  koordinator_ketua_kelas: 'Koordinator Ketua Kelas',
};

const ROLE_LANDING: Record<string, string> = {
  peserta: '/2in1/peserta',
  musyrif: '/2in1/musyrif',
  koordinator: '/2in1/koordinator',
  syaikh: '/2in1/syaikh',
  pengajar: '/kehadiran/pengajar',
  ketua_kelas: '/observasi/ketua-kelas',
  koordinator_ketua_kelas: '/observasi/koordinator',
};

export function ReportErrorButton({ user }: { user?: UserInfo | null }) {
  const [open, setOpen] = useState(false);
  const [nama, setNama] = useState('');
  const [wa, setWa] = useState('');
  const [keluhan, setKeluhan] = useState('');
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    setPageUrl(window.location.href);
  }, []);

  // Update pageUrl when modal opens (in case user navigated)
  const handleOpen = () => {
    setPageUrl(window.location.href);
    setOpen(true);
  };

  const isLoggedIn = !!user;

  const handleSubmit = () => {
    if (!keluhan.trim()) return;

    const displayName = isLoggedIn ? user.name : nama.trim();
    const displayWa = isLoggedIn ? '' : wa.trim();
    const origin = window.location.origin;

    const lines: string[] = [
      '*LAPORAN ERROR*',
      '',
      `Nama: ${displayName || '-'}`,
    ];

    if (isLoggedIn) {
      if (user.whatsappNumber) lines.push(`WA: ${user.whatsappNumber}`);
      lines.push(`Role: ${user.roleLabel}`);
      lines.push(`Dashboard: ${origin}${user.dashboardPath}`);
    } else {
      if (displayWa) lines.push(`WA: ${displayWa}`);
    }

    lines.push(`Halaman: ${pageUrl}`);
    // Digest error boundary terakhir (kalau ada) — inilah kunci untuk mencari
    // stack trace di log server; tanpa ini laporan "halaman gagal dimuat"
    // tidak bisa ditelusuri.
    const diag = readLastErrorDiag();
    if (diag) lines.push(`Kode error: ${diag}`);
    lines.push('');
    lines.push('*Keluhan:*');
    lines.push(keluhan.trim());

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${ADMIN_WA}?text=${text}`, '_blank');

    setOpen(false);
    setKeluhan('');
    setNama('');
    setWa('');
  };

  return (
    <>
      {/* Floating button */}
      <button
        onClick={handleOpen}
        aria-label="Laporkan Error"
        className="no-print"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--merah)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9998,
          fontSize: 20,
          fontWeight: 700,
          lineHeight: 1,
          transition: 'transform .12s',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M10 6v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="14" r="1.2" fill="currentColor" />
        </svg>
      </button>

      {/* Backdrop + Modal */}
      {open && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          {/* Backdrop */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.35)',
            }}
          />

          {/* Sheet */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 480,
              background: 'var(--surface)',
              borderRadius: '16px 16px 0 0',
              padding: '20px 20px 28px',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                background: 'var(--line-2)',
                margin: '0 auto 16px',
              }}
            />

            <h2 className="t-h2" style={{ marginBottom: 4 }}>
              Laporkan Masalah
            </h2>
            <p className="t-small" style={{ marginBottom: 16 }}>
              Laporan akan dikirim via WhatsApp ke admin.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {isLoggedIn ? (
                <>
                  <div>
                    <label className="field-label">Nama</label>
                    <input
                      className="input"
                      value={user.name}
                      disabled
                      style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                    />
                  </div>
                  <div>
                    <label className="field-label">Role</label>
                    <input
                      className="input"
                      value={user.roleLabel}
                      disabled
                      style={{ background: 'var(--surface-2)', color: 'var(--muted)' }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="field-label">Nama Pengajar</label>
                    <input
                      className="input"
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Masukkan nama Anda"
                    />
                  </div>
                  <div>
                    <label className="field-label">Nomor WhatsApp</label>
                    <input
                      className="input"
                      value={wa}
                      onChange={(e) => setWa(e.target.value)}
                      type="tel"
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="field-label">Halaman</label>
                <input
                  className="input"
                  value={pageUrl}
                  disabled
                  style={{
                    background: 'var(--surface-2)',
                    color: 'var(--muted)',
                    fontSize: 13,
                  }}
                />
              </div>

              <div>
                <label className="field-label">Keluhan / Masalah</label>
                <textarea
                  className="textarea"
                  value={keluhan}
                  onChange={(e) => setKeluhan(e.target.value)}
                  placeholder="Jelaskan masalah yang Anda alami..."
                  rows={4}
                  style={{ minHeight: 100 }}
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!keluhan.trim()}
                className="btn btn-primary"
                style={{
                  marginTop: 4,
                  width: '100%',
                  gap: 8,
                  opacity: keluhan.trim() ? 1 : 0.5,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 1.5C4.4 1.5 1.5 4.4 1.5 8c0 1.2.3 2.3.9 3.3L1.5 14.5l3.3-.9c1 .5 2 .8 3.2.8 3.6 0 6.5-2.9 6.5-6.5S11.6 1.5 8 1.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  <path d="M6 6c0 2 1.5 3.5 3.5 3.5l.7-.9-1.3-.4-.7.5c-.7-.3-1.2-.8-1.5-1.5l.5-.7-.4-1.3L6 6z" fill="currentColor" />
                </svg>
                Kirim via WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
