import Link from 'next/link';
import { getAllAccesses } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { PANDUAN_KATEGORI } from '@/lib/shakwa';
import { ShakwaForm, type HalaqahPengajar } from './ShakwaForm';
import { daftarProgramShakwa, programPengajarShakwa } from '@/lib/shakwa-program';
import { daftarCalonBadal } from '@/lib/shakwa-badal';
import type { PengajarSession } from '@/types/db';

export const dynamic = 'force-dynamic';

/**
 * Formulir Shakwa — pintu publik (tak butuh login). Kategori yang menyangkut
 * data pengajar (Izin, Tali Kasih) baru terbuka setelah masuk sebagai pengajar;
 * penjaganya ada di server action, halaman ini hanya menyesuaikan tampilan.
 */
export default async function ShakwaPage() {
  const accesses = await getAllAccesses();
  const pengajar = (accesses.find((a) => a.role === 'pengajar') as PengajarSession | undefined) ?? null;

  let halaqahPengajar: HalaqahPengajar[] = [];
  if (pengajar) {
    const { data } = await supabaseAdmin
      .from('hits_halaqah')
      .select('id, name')
      .eq('pengajar_id', pengajar.pengajar_id)
      .eq('active', true)
      .order('name');
    halaqahPengajar = (data ?? []).map((h) => ({ id: h.id as string, name: h.name as string }));
  }

  // Pilihan program/halaqah dari data nyata. Pengajar melihat program yang ia
  // ajar lebih dulu; daftar lengkap tetap dikirim untuk opsi "Program lain…".
  // Calon badal: pengajar aktif segender, tanpa diri sendiri. Server action
  // memeriksa ulang aturan ini — daftar di sini hanya untuk dropdown.
  const [semuaProgram, programSaya, calonBadal] = await Promise.all([
    daftarProgramShakwa(),
    pengajar ? programPengajarShakwa(pengajar.pengajar_id) : Promise.resolve([]),
    pengajar ? daftarCalonBadal(pengajar.gender, pengajar.pengajar_id) : Promise.resolve([]),
  ]);

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 40 }}>
          <div className="wordmark" style={{ marginBottom: 20 }}>
            <span className="mark">S</span> Shakwa
          </div>

          <h1 className="t-h1" style={{ marginBottom: 6 }}>
            Formulir Pengaduan &amp; Layanan
          </h1>
          <p className="t-body" style={{ marginBottom: 18 }}>
            Ahlan wa sahlan. Agar laporan Anda diproses cepat dan tepat, pilih kategori laporan
            yang sesuai dengan kendala Anda.
          </p>

          <details className="card-flat" style={{ padding: '14px 16px', marginBottom: 18 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              Panduan kategori laporan
              <span className="t-tiny" style={{ color: 'var(--muted-2)', marginLeft: 8 }}>
                klik untuk buka/tutup
              </span>
            </summary>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {PANDUAN_KATEGORI.map((p) => (
                <div key={p.judul}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{p.judul}</div>
                  <ul className="t-small" style={{ color: 'var(--muted-2)', paddingLeft: 18, margin: 0 }}>
                    {p.poin.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>

          <ShakwaForm
            prefillNama={pengajar?.name ?? accesses[0]?.name ?? ''}
            prefillGender={pengajar?.gender ?? accesses[0]?.gender ?? ''}
            isPengajar={!!pengajar}
            halaqahPengajar={halaqahPengajar}
            semuaProgram={semuaProgram}
            programSaya={programSaya}
            calonBadal={calonBadal}
          />

          <p className="t-tiny" style={{ color: 'var(--muted-2)', textAlign: 'center', marginTop: 20 }}>
            <Link href="/" style={{ color: 'inherit' }}>
              ← Kembali ke beranda
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
