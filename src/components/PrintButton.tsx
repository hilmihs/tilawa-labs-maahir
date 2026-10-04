'use client';

/**
 * Membuka dialog cetak browser — dari sana user memilih "Save as PDF".
 * Repo ini tak punya generator PDF di server (build standalone + RAM VPS
 * terbatas), jadi inilah jalur resmi menghasilkan PDF.
 */
export function PrintButton({ label = 'Cetak / Simpan PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost no-print"
      style={{ height: 30, padding: '0 10px' }}
      onClick={() => window.print()}
    >
      🖨 {label}
    </button>
  );
}
