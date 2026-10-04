'use client';

import { useState } from 'react';
import { daftarPengingat, tandaiPengingatTerkirim, type Pengingat } from './actions';
import { Bagian, useAksi } from './ui';

/**
 * Daftar tautan wa.me siap klik.
 *
 * Maahir tidak punya gateway WhatsApp — seluruh repo memakai deep-link dan
 * manusia yang menekan kirim. Yang disediakan di sini adalah kurasinya: siapa
 * yang perlu dihubungi dan teksnya sudah jadi.
 *
 * Penandaan "sudah dikirim" terpisah dari penyusunan daftar, karena membuat
 * tautan bukan berarti pesannya terkirim — dan penandaan itulah yang memulai
 * hitungan mundur menuju nonaktif.
 */
export function PanelPengingat({ periodeId }: { periodeId: string }) {
  const { pending, jalan, tampilan } = useAksi();
  const [daftar, setDaftar] = useState<Pengingat[]>([]);
  const [dibuka, setDibuka] = useState(false);
  const [ditandai, setDitandai] = useState<Set<string>>(new Set());

  const penyegaran = daftar.filter((d) => d.pengisian_id);

  const susun = () =>
    jalan(
      () => daftarPengingat({ periodeId }),
      (data) => {
        setDaftar(((data as { pengingat?: Pengingat[] })?.pengingat ?? []).slice(0, 200));
        setDibuka(true);
      }
    );
  const butuhPengajar = daftar.filter((d) => !d.pengisian_id);

  return (
    <Bagian
      judul="Pengingat WhatsApp"
      keterangan="Pengajar yang ketersediaannya sudah basi, dan pengajar yang bisa mengisi slot dengan antrean menumpuk."
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          disabled={pending}
          onClick={susun}
        >
          {pending ? 'Menyusun…' : 'Susun daftar pengingat'}
        </button>
        {penyegaran.length > 0 && (
          <button
            className="btn btn-sm btn-ghost"
            disabled={pending || ditandai.size === 0}
            onClick={() =>
              jalan(
                () => tandaiPengingatTerkirim({ pengisianIds: [...ditandai] }),
                // Muat ulang supaya keterangan "sudah diingatkan" langsung terlihat;
                // pesan hasil penandaan tetap tampil di atas.
                async () => {
                  setDitandai(new Set());
                  const r = await daftarPengingat({ periodeId });
                  if (r.ok) setDaftar(((r.data as { pengingat?: Pengingat[] })?.pengingat ?? []).slice(0, 200));
                }
              )
            }
          >
            Tandai {ditandai.size} pengingat sudah dikirim
          </button>
        )}
      </div>

      {tampilan}

      {dibuka && daftar.length === 0 && (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tidak ada yang perlu diingatkan saat ini.
        </p>
      )}

      {penyegaran.length > 0 && (
        <>
          <h3 className="t-small" style={{ fontWeight: 700, marginTop: 12, marginBottom: 6 }}>
            Perlu menyegarkan ketersediaan ({penyegaran.length})
          </h3>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 6 }}>
            Centang setelah pesannya benar-benar terkirim. Penandaan inilah yang memulai
            hitungan mundur sebelum ketersediaannya dinonaktifkan.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {penyegaran.map((d) => (
              <div
                key={d.pengisian_id!}
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
              >
                <input
                  id={`pengingat-${d.pengisian_id}`}
                  aria-label={`Tandai pengingat untuk ${d.nama} sudah dikirim`}
                  type="checkbox"
                  checked={ditandai.has(d.pengisian_id!)}
                  onChange={(e) => {
                    const n = new Set(ditandai);
                    if (e.target.checked) n.add(d.pengisian_id!);
                    else n.delete(d.pengisian_id!);
                    setDitandai(n);
                  }}
                />
                <label htmlFor={`pengingat-${d.pengisian_id}`} className="t-small" style={{ flex: '1 1 200px' }}>
                  {d.nama}
                  <span style={{ color: 'var(--muted-2)' }}> · {d.keterangan}</span>
                </label>
                <a className="btn btn-sm btn-ghost" href={d.waUrl} target="_blank" rel="noopener noreferrer">
                  Kirim
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {butuhPengajar.length > 0 && (
        <>
          <h3 className="t-small" style={{ fontWeight: 700, marginTop: 12, marginBottom: 6 }}>
            Ajakan mengisi slot yang kekurangan pengajar ({butuhPengajar.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {butuhPengajar.slice(0, 60).map((d, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="t-small" style={{ flex: '1 1 200px' }}>
                  {d.nama}
                  <span style={{ color: 'var(--muted-2)' }}> · {d.keterangan}</span>
                </span>
                <a className="btn btn-sm btn-ghost" href={d.waUrl} target="_blank" rel="noopener noreferrer">
                  Kirim
                </a>
              </div>
            ))}
          </div>
          {butuhPengajar.length > 60 && (
            <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6 }}>
              {butuhPengajar.length - 60} ajakan lain disembunyikan agar daftar tetap terbaca.
            </p>
          )}
        </>
      )}
    </Bagian>
  );
}
