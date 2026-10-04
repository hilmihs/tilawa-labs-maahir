import type { ReactNode } from 'react';
import { FiturIkon, type IkonNama } from '@/components/FiturIkon';

/**
 * Header forest halaman fitur (desain "Overhaul Tilawah" 1c/1d):
 * baris atas = tautan Beranda + aksi kanan, lalu ikon + judul fitur, lalu
 * (opsional) garis pemisah dan isi tambahan seperti identitas pengguna.
 *
 * `menumpang` memberi ruang bawah ekstra supaya kartu pertama di bawahnya bisa
 * "menumpang" ke header — bungkus isi berikutnya dengan `.fh-tumpang`.
 *
 * Memasang `data-punya-beranda` → FAB Beranda global disembunyikan (CSS).
 */
export function FiturHeader({
  ikon,
  judul,
  sub,
  kanan,
  menumpang = false,
  children,
}: {
  ikon: IkonNama;
  judul: string;
  sub?: ReactNode;
  kanan?: ReactNode;
  menumpang?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className={`fitur-header${menumpang ? ' menumpang' : ''}`} data-punya-beranda>
      <div className="fh-atas">
        <a href="/" className="fh-beranda">
          <span className="fh-mark" aria-hidden />
          <FiturIkon nama="rumah" size={13} />
          Beranda
        </a>
        {kanan && <div className="fh-kanan">{kanan}</div>}
      </div>
      <div className="fh-judul">
        <div className="fh-ikon">
          <FiturIkon nama={ikon} size={22} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="fh-title">{judul}</div>
          {sub && <div className="fh-sub">{sub}</div>}
        </div>
      </div>
      {children && (
        <>
          <div className="fh-garis" />
          {children}
        </>
      )}
    </header>
  );
}

/** Baris identitas di dalam FiturHeader: avatar emas, label kecil, nama, sisi kanan. */
export function FiturIdentitas({
  inisial,
  label,
  nama,
  kanan,
}: {
  inisial: string;
  label: string;
  nama: string;
  kanan?: ReactNode;
}) {
  return (
    <div className="fh-identitas">
      <div className="fh-avatar">{inisial}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fh-label">{label}</div>
        <div className="fh-nama">{nama}</div>
      </div>
      {kanan}
    </div>
  );
}

/** Chip periode emas (dipakai di header forest). */
export function ChipPeriode({ children }: { children: ReactNode }) {
  return (
    <span className="chip-periode">
      <span className="dot" />
      {children}
    </span>
  );
}
