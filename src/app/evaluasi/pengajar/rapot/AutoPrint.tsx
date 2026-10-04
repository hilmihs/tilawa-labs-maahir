'use client';

import { useEffect } from 'react';

// Sudah pernah membuka dialog cetak untuk token ini di sesi tab ini.
// Modul-scope (bukan useRef) supaya StrictMode dev yang menjalankan effect dua kali
// tidak memunculkan dialog cetak dua kali.
const sudahCetak = new Set<string>();

function tungguGambar(batasMs: number): Promise<void> {
  const belum = Array.from(document.images).filter((im) => !im.complete);
  if (belum.length === 0) return Promise.resolve();
  const semua = Promise.all(
    belum.map(
      (im) =>
        new Promise<void>((res) => {
          im.addEventListener('load', () => res(), { once: true });
          im.addEventListener('error', () => res(), { once: true });
        })
    )
  ).then(() => undefined);
  const batas = new Promise<void>((res) => setTimeout(res, batasMs));
  return Promise.race([semua, batas]);
}

/**
 * Membuka dialog cetak otomatis begitu halaman rapot siap.
 *
 * Menunggu font & gambar (logo + QR) selesai dimuat dulu — kalau tidak, snapshot
 * cetak bisa keburu diambil saat logo/QR masih kosong.
 */
export default function AutoPrint({ token }: { token: string }) {
  useEffect(() => {
    if (sudahCetak.has(token)) return;
    sudahCetak.add(token);

    let batal = false;
    const jalan = async () => {
      try {
        await document.fonts?.ready;
      } catch {
        /* font API tak ada / gagal — lanjut saja */
      }
      await tungguGambar(3000);
      if (batal) return;
      requestAnimationFrame(() => window.print());
    };
    void jalan();

    return () => {
      batal = true;
    };
  }, [token]);

  return null;
}
