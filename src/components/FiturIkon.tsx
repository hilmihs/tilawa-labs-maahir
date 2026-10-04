/**
 * Ikon garis 16×16 untuk tiap fitur — dipakai di menu beranda dan FiturHeader.
 * Sebagian diambil dari desain "Overhaul Tilawah", sisanya digambar sepadan
 * (stroke 1.5, ujung bulat) supaya satu keluarga.
 */
const PATH = {
  kalender: 'M3 4.5h10v9H3zM3 7.5h10M5.5 2.5v3M10.5 2.5v3M6 10.5l1.5 1.5 3-3',
  bendera: 'M4 14V2.5M4 3h8l-1.5 2.5L12 8H4',
  jam: 'M8 2a6 6 0 110 12A6 6 0 018 2zM8 5v3l2 1.5',
  buku: 'M2 3.5c2-.8 4-.8 6 .5 2-1.3 4-1.3 6-.5v9c-2-.8-4-.8-6 .5-2-1.3-4-1.3-6-.5zM8 4v9',
  cek: 'M8 2a6 6 0 110 12A6 6 0 018 2zM5.5 8.2l1.8 1.8 3.2-3.5',
  mic: 'M6 4a2 2 0 014 0v4a2 2 0 01-4 0zM3.5 8a4.5 4.5 0 009 0M8 12.5V14',
  grafik: 'M3 13.5h10M4.5 11V8M8 11V4.5M11.5 11V6.5',
  pesan: 'M2.5 3.5h11v7.5H7l-3 2.5V11H2.5z',
  orang: 'M8 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4',
  kelompok: 'M6 3.5a2 2 0 110 4 2 2 0 010-4zM2 13c.4-2 2-3.5 4-3.5s3.6 1.5 4 3.5M11 4a1.8 1.8 0 110 3.6M11.5 9.6c1.4.3 2.3 1.6 2.5 3.4',
  bintang: 'M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2l-3.6 1.9.7-4-2.9-2.8 4-.6z',
  tas: 'M2.5 5.5h11v8h-11zM5.5 5.5V4a1 1 0 011-1h3a1 1 0 011 1v1.5M2.5 8.5h11',
  dokumen: 'M4 2h5.5L12 4.5V14H4zM9.5 2v2.5H12M6 8h4M6 10.5h4',
  mata: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 110 4 2 2 0 010-4z',
  larang: 'M8 2a6 6 0 110 12A6 6 0 018 2zM3.8 3.8l8.4 8.4',
  daftar: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  atur: 'M8 5.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4',
  rumah: 'M2.5 7.5L8 3l5.5 4.5M4 6.5V13h8V6.5',
} as const;

export type IkonNama = keyof typeof PATH;

export function FiturIkon({ nama, size = 18 }: { nama: IkonNama; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={PATH[nama]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
