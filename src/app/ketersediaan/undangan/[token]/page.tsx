import { supabaseAdmin } from '@/lib/supabase-admin';
import { aksesTokenBerakhir } from '@/lib/ketersediaan-konfirmasi';

export const dynamic = 'force-dynamic';

/**
 * Halaman undangan peserta.
 *
 * Sengaja ada di antara pesan WhatsApp dan tautan grup, alih-alih menyebar
 * `chat.whatsapp.com` mentah. Tiga alasannya:
 *
 *  1. Tautan grup tidak beredar liar di luar penerima yang dituju.
 *  2. Pembukaannya dapat dicatat — satu-satunya sinyal "sudah diundang" yang
 *     bisa didapat tanpa API WhatsApp, yang memang tidak ada untuk grup.
 *  3. Bila tautan grup harus diganti (bocor, grup dibuat ulang), halaman ini
 *     tidak berubah sehingga pesan yang sudah terkirim tetap berlaku.
 */
export default async function UndanganPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select(
      'id, status, undangan_dibuka_pada, pendaftar:pendaftar_id(nama), usulan:usulan_id(nama_halaqah, tanggal_mulai, dikonfirmasi_pada, grup_wa_link, status, slot:slot_id(label, mode, lokasi), pengajar:pengajar_id(name))'
    )
    .eq('undangan_token', token)
    .maybeSingle();

  if (!data) {
    return (
      <Bingkai>
        <h1 className="t-h1">Undangan tidak dikenali</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tautan ini sudah tidak berlaku atau salah salin. Hubungi pengajar atau koordinator HITS.
        </p>
      </Bingkai>
    );
  }

  const peserta = data.pendaftar as { nama: string } | null;
  const usulan = data.usulan as {
    nama_halaqah: string | null;
    tanggal_mulai: string | null;
    dikonfirmasi_pada: string | null;
    grup_wa_link: string | null;
    status: string;
    slot?: { label: string; mode: string; lokasi: string | null } | null;
    pengajar?: { name: string } | null;
  } | null;

  // Undangan mengikuti masa berlaku tautan konfirmasi: lewat 30 hari setelah
  // halaqah mulai, nama peserta dan tautan grup tidak lagi ditampilkan.
  if (!usulan || aksesTokenBerakhir(usulan, new Date())) {
    return (
      <Bingkai>
        <h1 className="t-h1">Undangan sudah tidak berlaku</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Masa berlaku tautan ini sudah habis. Hubungi pengajar atau koordinator HITS bila Anda
          belum bergabung ke grup kelas.
        </p>
      </Bingkai>
    );
  }

  // Catat pembukaan sekali saja. Kegagalan pencatatan tidak boleh menghalangi
  // peserta bergabung, jadi tidak ada penanganan galat yang menggagalkan render.
  if (!data.undangan_dibuka_pada) {
    await supabaseAdmin
      .from('ks_usulan_peserta')
      .update({ undangan_dibuka_pada: new Date().toISOString() })
      .eq('id', data.id);
  }

  const slot = usulan?.slot ?? null;

  return (
    <Bingkai>
      <h1 className="t-h1" style={{ marginBottom: 4 }}>
        Selamat bergabung{peserta ? `, ${peserta.nama}` : ''}
      </h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        Anda terdaftar di halaqah HITS berikut.
      </p>

      <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 16 }}>
        <Baris label="Halaqah" nilai={usulan?.nama_halaqah ?? 'Halaqah HITS'} />
        <Baris label="Jadwal" nilai={slot?.label ?? '—'} />
        <Baris
          label="Mode"
          nilai={slot?.mode === 'offline' ? `Offline — ${slot.lokasi ?? 'lokasi menyusul'}` : 'Online'}
        />
        <Baris label="Pengajar" nilai={usulan?.pengajar?.name ?? '—'} />
        <Baris label="Mulai" nilai={usulan?.tanggal_mulai ?? 'menyusul'} />
      </div>

      {usulan?.grup_wa_link ? (
        <a
          className="btn"
          href={usulan.grup_wa_link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block' }}
        >
          Gabung Grup WhatsApp
        </a>
      ) : (
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Grup kelas sedang disiapkan pengajar. Silakan buka kembali tautan ini beberapa saat lagi —
          tautannya tetap sama.
        </p>
      )}

      <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
        Simpan tautan ini. Bila tautan grup diganti, halaman ini akan menunjukkan yang terbaru.
      </p>
    </Bingkai>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <p className="t-small" style={{ margin: '2px 0' }}>
      <span style={{ color: 'var(--muted-2)', display: 'inline-block', minWidth: 90 }}>{label}</span>
      <strong>{nilai}</strong>
    </p>
  );
}

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 24 }}>
          <div className="wordmark" style={{ marginBottom: 16 }}>
            <span className="mark">H</span> Tilawa Labs · HITS
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
