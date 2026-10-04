'use client';

import { useState, useTransition } from 'react';
import { ambilGrupKolam, setujuiKonfirmasi, simpanGrupWa, tolakKonfirmasi } from './actions';

export interface PesertaTampil {
  id: string;
  nama: string;
  umur: number | null;
  status: string;
  waUrl: string | null;
}

interface Props {
  token: string;
  status: string;
  alasanTolak: string | null;
  namaHalaqah: string;
  slotLabel: string;
  grupLink: string | null;
  peserta: PesertaTampil[];
}

export function PanelKonfirmasi(props: Props) {
  const [pending, mulai] = useTransition();
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [bukaTolak, setBukaTolak] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [link, setLink] = useState(props.grupLink ?? '');
  const [setuju, setSetuju] = useState(
    props.status === 'dikonfirmasi' || props.status === 'dikirim' || props.status === 'gagal'
  );

  function jalan(fn: () => Promise<{ ok: true; pesan: string } | { ok: false; error: string }>, sesudah?: () => void) {
    setPesan(null);
    setGalat(null);
    mulai(async () => {
      const r = await fn();
      if (r.ok) {
        setPesan(r.pesan);
        sesudah?.();
      } else setGalat(r.error);
    });
  }

  if (props.status === 'ditolak') {
    return (
      <Kotak nada="netral">
        Anda menyatakan tidak dapat mengambil halaqah ini
        {props.alasanTolak ? `: ${props.alasanTolak}` : '.'} Koordinator akan menawarkannya ke pengajar berikutnya.
      </Kotak>
    );
  }
  if (props.status === 'kedaluwarsa') {
    return (
      <Kotak nada="netral">
        Tautan ini sudah lewat tenggat dan slotnya ditawarkan ke pengajar berikutnya. Hubungi
        koordinator bila Anda masih bersedia.
      </Kotak>
    );
  }
  if (props.status === 'batal') {
    return <Kotak nada="netral">Halaqah ini dibatalkan koordinator.</Kotak>;
  }

  return (
    <div>
      {galat && <Kotak nada="galat">{galat}</Kotak>}
      {pesan && <Kotak nada="baik">{pesan}</Kotak>}

      {!setuju && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="t-small">
            Dengan menyetujui, Anda menyatakan bersedia mengajar halaqah ini sesuai jadwal di atas.
            Daftar peserta akan terbuka setelahnya.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn"
              disabled={pending}
              onClick={() => jalan(() => setujuiKonfirmasi({ token: props.token }), () => setSetuju(true))}
            >
              {pending ? 'Memproses…' : 'Saya bersedia'}
            </button>
            <button className="btn btn-ghost" onClick={() => setBukaTolak((v) => !v)}>
              Tidak dapat mengambil
            </button>
          </div>

          {bukaTolak && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea
                className="input"
                rows={3}
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Mohon tuliskan alasannya agar koordinator dapat menindaklanjuti"
              />
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() => jalan(() => tolakKonfirmasi({ token: props.token, alasan }))}
              >
                Kirim penolakan
              </button>
            </div>
          )}
        </div>
      )}

      {setuju && (
        <>
          <section style={{ marginTop: 20 }}>
            <h2 className="t-h2" style={{ fontSize: 16, marginBottom: 4 }}>Grup WhatsApp kelas</h2>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
              Buat grup baru di WhatsApp dengan nama di bawah, lalu salin tautan undangannya
              (Info Grup → Undang via tautan) dan tempel di sini.
            </p>
            <div className="card-flat" style={{ padding: '8px 10px', marginBottom: 8 }}>
              <code className="t-small">{props.namaHalaqah} — {props.slotLabel}</code>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                className="input"
                style={{ flex: '1 1 280px' }}
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://chat.whatsapp.com/…"
              />
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() => jalan(() => simpanGrupWa({ token: props.token, link }))}
              >
                Simpan tautan grup
              </button>
              {!props.grupLink && (
                <button
                  className="btn btn-sm btn-ghost"
                  disabled={pending}
                  onClick={() => jalan(() => ambilGrupKolam({ token: props.token }))}
                >
                  Saya tidak bisa membuat grup
                </button>
              )}
            </div>
          </section>

          <section style={{ marginTop: 20 }}>
            <h2 className="t-h2" style={{ fontSize: 16, marginBottom: 4 }}>
              Peserta ({props.peserta.length})
            </h2>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
              {props.grupLink || link
                ? 'Kirim undangan satu per satu. Tautannya mengarah ke halaman undangan, bukan tautan grup mentah — supaya tautan grup tidak tersebar liar dan dapat diganti tanpa mengganggu undangan.'
                : 'Simpan tautan grup terlebih dahulu agar undangan dapat dikirim.'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {props.peserta.map((p) => (
                <div
                  key={p.id}
                  className="card-flat"
                  style={{
                    padding: '8px 10px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <span className="t-small">
                    {p.nama}
                    {p.umur !== null && (
                      <span style={{ color: 'var(--muted-2)' }}> · {p.umur} th</span>
                    )}
                    {p.status === 'terenroll' && (
                      <span style={{ color: 'var(--hijau-ink)' }}> · terdaftar di CMS</span>
                    )}
                  </span>
                  {p.waUrl && (props.grupLink || link) && (
                    <a
                      className="btn btn-sm btn-ghost"
                      href={p.waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Kirim undangan
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Kotak({ nada, children }: { nada: 'baik' | 'galat' | 'netral'; children: React.ReactNode }) {
  const warna =
    nada === 'galat' ? 'var(--merah-ink)' : nada === 'baik' ? 'var(--hijau-ink)' : 'var(--muted-2)';
  return (
    <div
      className="t-small"
      style={{
        border: `1px solid ${nada === 'netral' ? 'var(--line)' : warna}`,
        color: warna,
        borderRadius: 8,
        padding: '8px 10px',
        margin: '8px 0',
      }}
    >
      {children}
    </div>
  );
}
