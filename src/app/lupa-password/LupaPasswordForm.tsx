'use client';

import { useState, useTransition } from 'react';
import { requestPasswordReset } from './actions';
import { ADMIN_WA } from '@/lib/constants';

/** Nomor Technical Support dalam format enak dibaca: 62812… → +62 812-… */
const ADMIN_WA_DISPLAY = `+${ADMIN_WA}`;

export function LupaPasswordForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  // true bila WhatsApp gagal dibuka otomatis (popup diblokir browser) — pemohon
  // WAJIB menekan tombol sendiri, kalau tidak permintaannya tak pernah sampai.
  const [needManual, setNeedManual] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    // Tab dibuka SEKARANG, selagi masih di dalam gesture klik — kalau menunggu
    // server action selesai, browser (terutama di HP) menganggapnya popup dan
    // memblokirnya, sehingga WA tak pernah terkirim ke Technical Support.
    const tab = window.open('', '_blank');

    setError(null);
    start(async () => {
      const res = await requestPasswordReset(undefined, fd);
      if (res?.error || !res?.waMeUrl) {
        tab?.close();
        setError(res?.error ?? 'Gagal membuat permintaan. Coba lagi.');
        return;
      }
      setWaUrl(res.waMeUrl);
      if (tab && !tab.closed) {
        tab.location.href = res.waMeUrl;
        setNeedManual(false);
      } else {
        // Popup diblokir → pindah di tab yang sama; kalau ini pun gagal,
        // tombol manual di bawah tetap tersedia.
        setNeedManual(true);
        window.location.href = res.waMeUrl;
      }
    });
  }

  if (waUrl) {
    return (
      <div className={`banner ${needManual ? 'banner-error' : 'banner-success'}`} style={{ marginTop: 12 }}>
        <div>
          <div className="title">
            {needManual ? 'Belum terkirim — tekan tombol di bawah' : 'Tinggal satu langkah lagi'}
          </div>
          <div className="desc">
            Permintaan Anda <strong>baru diproses setelah pesan WhatsApp benar-benar terkirim</strong> ke
            Technical Support. Buka WhatsApp, lalu tekan tombol kirim pada pesan yang sudah disiapkan.
            Password baru akan dikirim ke WhatsApp Anda setelah disetujui.
          </div>
          <div style={{ marginTop: 10 }}>
            <a href={waUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-block">
              Kirim permintaan via WhatsApp
            </a>
          </div>
          <p className="t-tiny" style={{ color: 'var(--muted-2)', marginTop: 8 }}>
            Kalau tombol di atas tidak membuka WhatsApp, hubungi Technical Support langsung di{' '}
            <strong>{ADMIN_WA_DISPLAY}</strong> dan sebutkan nama serta nomor WhatsApp Anda.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <label className="field-label" htmlFor="lupa_whatsapp_number">Nomor WhatsApp Anda</label>
        <input
          id="lupa_whatsapp_number"
          className="input"
          name="whatsapp_number"
          type="tel"
          autoComplete="tel"
          required
          placeholder="08xxxxxxxxxx"
        />
        <p className="t-small" style={{ color: 'var(--muted)', marginTop: 6 }}>
          Pakai nomor yang sama dengan saat login. Setelah ini WhatsApp akan terbuka — permintaan baru
          diproses kalau pesannya Anda kirim.
        </p>
      </div>
      {error && (
        <div className="banner banner-error">
          <div>
            <div className="title">Gagal</div>
            <div className="desc">{error}</div>
          </div>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="btn btn-block btn-primary"
        style={{ marginTop: 6 }}
      >
        {pending ? 'Memproses…' : 'Kirim Permintaan'}
      </button>
    </form>
  );
}
