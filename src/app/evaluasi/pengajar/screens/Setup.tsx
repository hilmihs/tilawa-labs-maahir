'use client';

interface SetupProps {
  judul: string;
  sesiLabel: string;
  halaqahLine: string;
  pesertaCount: number;
  isUjian: boolean;
  ambangUjian: number;
  mustawa: number | null;
  /** Nomor sesi yang aktif (bisa dipilih). Untuk ujian, yang di-soft-delete tak masuk sini. */
  sesiOptions: number[];
  activeSession: number;
  /** Label per sesi (index 0-based). Bila kosong → "Sesi N". Dipakai ujian akhir: "Ujian QN"/"Ujian PB". */
  sesiOptionLabels?: string[];
  pickSession: (n: number) => void;
  /** Ujian only: nomor sesi yang sudah dihapus (untuk dipulihkan). */
  deletedOptions?: number[];
  /** Ujian only: hapus/pulihkan sesi. */
  onToggleSesi?: (n: number, dihapus: boolean) => void;
  /** Nomor sesi yang sudah dikirim ke koordinator (ditandai "terkirim", hanya-baca). */
  sesiTerkirim?: number[];
  /** Sesi yang sedang dipilih sudah terkirim. */
  terkunci?: boolean;
  lanjutLabel?: string;
  back: () => void;
  lanjut: () => void;
}

export function Setup(props: SetupProps) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: '#ffffff', borderBottom: '1px solid var(--line)' }}>
        <button onClick={props.back} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--line)', background: '#ffffff', color: 'var(--ink-2)', fontSize: 15, cursor: 'pointer' }}>←</button>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{props.judul}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{props.sesiLabel}</div>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Halaqah</div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{props.halaqahLine}</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{props.pesertaCount} peserta terdaftar</div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid var(--line)', borderRadius: 12, padding: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 10 }}>{props.isUjian ? 'Ujian yang mana?' : 'Evaluasi ke berapa?'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
            {props.sesiOptions.map((n) => {
              const on = n === props.activeSession;
              // Sesi terkirim ditandai: dulu semua nomor tampak sama, pengajar
              // membuka sesi yang sudah dikirim, menyunting, dan server diam-diam
              // menolak setiap simpanan.
              const sent = !!props.sesiTerkirim?.includes(n);
              return (
                <div key={n} style={{ position: 'relative' }}>
                  <button
                    onClick={() => props.pickSession(n)}
                    style={{ width: '100%', minHeight: 44, padding: '4px 2px', borderRadius: 8, border: `1.5px solid ${on ? 'var(--ink)' : sent ? 'oklch(0.85 0.06 150)' : '#ffffff'}`, background: on ? 'var(--ink)' : sent ? 'oklch(0.96 0.035 150)' : '#ffffff', color: on ? '#ffffff' : 'var(--ink-2)', font: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15 }}
                  >
                    <span>{props.sesiOptionLabels?.[n - 1] ?? `Sesi ${n}`}</span>
                    {sent && (
                      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em', color: on ? '#ffffff' : 'oklch(0.40 0.10 150)', opacity: on ? 0.85 : 1 }}>
                        ✓ terkirim
                      </span>
                    )}
                  </button>
                  {/* Tombol hapus sesi ujian dibuang (0062): Ujian QN & Ujian PB
                      dua-duanya wajib — masing-masing menyumbang 70% nilai akhir
                      rapot track-nya, dan server menolak penghapusan dgn 409.
                      Tombol pulihkan di bawah tetap ada untuk sesi yang terlanjur
                      dihapus sebelum aturan ini berlaku. */}
                </div>
              );
            })}
          </div>
          {props.isUjian && !!props.deletedOptions?.length && (
            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {props.deletedOptions.map((n) => (
                <button
                  key={n}
                  onClick={() => props.onToggleSesi?.(n, false)}
                  style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px dashed var(--line-2)', background: 'var(--surface-2)', color: 'var(--muted)', font: 'inherit', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  ↩ Pulihkan {props.sesiOptionLabels?.[n - 1] ?? `Sesi ${n}`}
                </button>
              ))}
            </div>
          )}
          {props.terkunci && (
            <div style={{ marginTop: 10, fontSize: 11.5, lineHeight: 1.45, color: 'oklch(0.40 0.10 150)', background: 'oklch(0.96 0.035 150)', border: '1px solid oklch(0.85 0.06 150)', borderRadius: 8, padding: '8px 10px' }}>
              🔒 Sesi ini sudah dikirim ke koordinator — nilainya hanya bisa dilihat. Bila perlu
              diperbaiki, buka kuncinya dari daftar peserta.
            </div>
          )}
          {props.isUjian && (
            <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 10 }}>
              Ujian QN dan Ujian PB dua-duanya wajib — masing-masing menyumbang nilai akhir Rapot
              Akhir track-nya, jadi tak bisa dihapus.
            </div>
          )}
        </div>

        {props.isUjian && (
          <div style={{ background: 'oklch(0.96 0.035 85)', border: '1px solid oklch(0.88 0.07 82)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'oklch(0.50 0.09 70)' }}>Ambang kelulusan: {props.ambangUjian} / 100</div>
            <div style={{ fontSize: 11, color: 'oklch(0.50 0.09 70)', opacity: 0.85, marginTop: 3 }}>
              Ditetapkan koordinator untuk Mustawa {props.mustawa ?? '—'}. Skor di bawah ambang direkomendasikan mengulang.
            </div>
          </div>
        )}

      </div>

      <div style={{ flex: 1 }} />
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          background: '#ffffff',
          borderTop: '1px solid var(--line)',
          padding: '10px 16px calc(20px + env(safe-area-inset-bottom))',
          marginTop: 16,
        }}
      >
        <button
          onClick={props.lanjut}
          className="ev-dark"
          style={{ width: '100%', height: 50, borderRadius: 8, border: 'none', background: 'var(--ink)', color: '#ffffff', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
        >
          {props.lanjutLabel ?? 'Lanjut ke daftar peserta →'}
        </button>
      </div>
    </>
  );
}
