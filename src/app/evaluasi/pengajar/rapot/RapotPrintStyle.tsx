import type { ReactElement } from 'react';

// Gaya cetak bersama untuk semua lembar rapot A4 (track, berkala & ujian).
//
// Kenapa perlu: `globals.css` memasang `@page { size: A4 landscape; margin: 10mm }`
// untuk halaman "cetak" modul lain. Lembar rapot ini potret 794×1123px, jadi tanpa
// override hasilnya meluber — terpotong ke samping dan menyisakan halaman kosong.
//
// Trik penting:
// - `@page` dideklarasikan ulang (potret, margin 0). Karena <style> ini dirender di
//   dalam body — setelah globals.css di <head> — deklarasinya menang di cascade.
// - Ukuran lembar dipaksa dalam mm, bukan px. 794px/1123px hanya *mendekati* A4
//   (794.9×1122.5px @96dpi); selisih pecahan itu cukup untuk melahirkan halaman
//   kedua yang kosong. 210mm × 296mm selalu muat dalam satu halaman.
// - `overflow: hidden` menjaga lembar tetap satu halaman bila ada 1–2px kelebihan.
// - `.a4-sheet > * { flex-shrink: 0 }` (cetak): lembar adalah kolom flex dengan
//   tinggi PASTI 296mm. Tanpa ini, isi yang kelebihan tidak meluber keluar — ia
//   *digencet*: tiap blok menyusut dan tiap tabel (yang ber-`overflow: hidden`
//   demi border-radius) menelan barisnya sendiri, jadi judul seksi tetap tercetak
//   di atas kotak kosong. Kelebihan 400px hilang tanpa jejak. Dengan flex-shrink 0
//   kelebihan memotong di bawah — kentara, bukan senyap.
// - Lembar bertanda `.a4-sheet-akhir` sengaja dibebaskan (`height: auto;
//   min-height: 296mm; overflow: visible`). Di situlah seluruh teks bebas panjang
//   ditaruh (catatan sesi & catatan penguji) sekaligus QR dan tanda tangan. Kalau
//   catatannya mengamuk, dokumen boleh tumbuh ke halaman berikutnya — yang tidak
//   boleh adalah kehilangan QR dan tanda tangan diam-diam. Kelasnya dipasang
//   manual, bukan `:last-child`, supaya cetak massal N peserta tetap benar.
//
// WAJIB `dangerouslySetInnerHTML`, JANGAN `<style>{css}</style>`. React
// meng-escape `>` jadi `&gt;` pada anak teks, dan isi <style> diurai sebagai
// RAWTEXT — entitasnya tidak pernah didekode. Akibatnya SETIAP aturan bercombinator
// anak mati diam-diam di HTML hasil SSR (hidrasi memang menambalnya, tapi Ctrl+P
// sebelum hidrasi atau JS mati akan mencetak dengan cascade yang bolong).
const CSS = `
  /* Sengaja BUKAN flexbox. Lembar 794px lebih lebar dari layar HP; flex item
     yang di-align-items:center meluber ke KIRI juga, dan area kiri itu tak
     bisa dijangkau scroll (origin scroll ada di x=0) — sisi kiri lembar hilang
     permanen di HP. margin:0 auto pada blok biasa jatuh ke 0 saat ruang
     kurang, jadi ia tetap ke tengah di layar lebar tapi rata kiri di HP. */
  .a4-stack { display: block; }
  .a4-sheet + .a4-sheet { margin-top: 20px; }
  .a4-sheet { margin: 0 auto; box-shadow: 0 1px 3px rgba(20,18,14,0.10), 0 8px 28px -12px rgba(20,18,14,0.20); }

  @media screen {
    /* Lembar 794px lebih lebar dari layar HP — biarkan wrapper yang menggeser,
       jangan biarkan <body> ikut melebar. */
    .a4-print-wrap { background: #f4f2ed; padding: 16px 12px 96px; overflow-x: auto; }
  }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
    .noprint, .no-print { display: none !important; }
    .a4-print-wrap { background: #fff !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
    .a4-sheet + .a4-sheet { margin-top: 0 !important; }
    .a4-sheet > * { flex-shrink: 0 !important; }
    .a4-sheet {
      width: 210mm !important;
      height: 296mm !important;
      min-height: 0 !important;
      max-width: none !important;
      margin: 0 !important;
      overflow: hidden;
      transform: none !important;
      box-shadow: none !important;
      break-inside: avoid;
      page-break-inside: avoid;
      break-after: page;
      page-break-after: always;
    }
    .a4-sheet:last-child { break-after: auto; page-break-after: auto; }
    /* Ditandai kelas, BUKAN :last-child. Overlay cetak massal menaruh 2N lembar
       dari N peserta dalam satu stack — dengan :last-child hanya lembar penutup
       peserta terakhir yang dibebaskan, sisanya tetap memotong QR-nya diam-diam.
       Lembar tunggal (berkala lawas) memang sengaja tidak diberi kelas ini. */
    .a4-sheet-akhir {
      height: auto !important;
      min-height: 296mm !important;
      overflow: visible;
      break-inside: auto;
      page-break-inside: auto;
    }

    /* Pita status ("RAPOT DICABUT") ikut tercetak. Ia memakan ~11mm di halaman
       pertama, jadi lembar tepat di bawahnya dipendekkan supaya tidak mendorong
       1 halaman kosong.
       - box-sizing: border-box wajib: tanpa itu padding+border membuat pita
         217,9mm — lebih lebar dari halaman — dan Chrome menyusutkan SELURUH
         dokumen ke ~96% agar muat.
       - Combinator KETURUNAN, bukan anak: rapot ujian lawas merender .a4-stack
         miliknya sendiri, jadi lembarnya cucu — bukan anak — dari stack yang
         bersebelahan dengan pita. */
    .a4-banner {
      width: 210mm !important;
      max-width: none !important;
      box-sizing: border-box !important;
      margin: 0 !important;
      border-radius: 0 !important;
      break-after: avoid;
      page-break-after: avoid;
    }
    .a4-banner + .a4-sheet,
    .a4-banner + .a4-stack .a4-sheet:first-child {
      height: 284mm !important;
      min-height: 0 !important;
      /* Pita memangkas 12mm dari lembar pertama. Kalau isinya kebetulan mepet,
         biarkan meluber ke halaman berikutnya — jangan sampai QR dan tanda
         tangan yang terpotong. */
      overflow: visible;
      break-inside: auto;
      page-break-inside: auto;
    }
  }
`;

export default function RapotPrintStyle(): ReactElement {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
