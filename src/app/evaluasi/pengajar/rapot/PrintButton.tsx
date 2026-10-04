'use client';

// Tombol cetak/simpan PDF — hanya tampil di layar (disembunyikan saat print).
export default function PrintButton() {
  return (
    <button
      type="button"
      className="noprint"
      onClick={() => window.print()}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 50,
        padding: '12px 18px',
        borderRadius: 999,
        border: 'none',
        background: 'oklch(0.58 0.09 165)',
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
      }}
    >
      ⬇ Cetak / Simpan PDF
    </button>
  );
}
