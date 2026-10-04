import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { getPeriodeAktif } from '@/lib/ketersediaan-periode';
import { tilawahTerkonfigurasi } from '@/lib/tilawah/client';
import { PanelTilawah, type BarisOutbox } from './PanelTilawah';

export const dynamic = 'force-dynamic';

export default async function PemetaanTilawahPage() {
  await requireOneOfRoles(['koordinator']);
  if (!(await bolehLihatFiturTersembunyi())) notFound();

  const periode = await getPeriodeAktif();

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">H</span> Pemetaan CMS Tilawah
            </div>
            <LogoutButton />
          </div>

          <p className="t-small" style={{ marginBottom: 16 }}>
            <Link href="/ketersediaan/koordinator">← Kembali ke Kelola Ketersediaan</Link>
          </p>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Pemetaan & pengiriman CMS tilawah</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            CMS tilawah tidak menerima teks jadwal — hanya nomor baris tabel masternya
            (<code>day_id</code>, <code>session_id</code>, <code>level_id</code>). Pasangkan sekali per
            batch. Slot yang belum dipetakan membuat halaqahnya ditahan, bukan dikirim dengan tebakan.
          </p>

          {!tilawahTerkonfigurasi() && (
            <div
              className="t-small"
              style={{
                border: '1px solid var(--merah-ink)',
                color: 'var(--merah-ink)',
                borderRadius: 8,
                padding: '8px 10px',
                marginBottom: 16,
              }}
            >
              Kredensial CMS tilawah belum diset (TILAWAH_BASE_URL / TILAWAH_EMAIL /
              TILAWAH_PASSWORD). Daftar master tidak dapat ditarik.
            </div>
          )}

          {!periode ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada periode aktif.
            </p>
          ) : (
            <PanelTilawah
              periodeId={periode.id}
              namaPeriode={periode.nama}
              programId={periode.tilawah_program_id}
              batchId={periode.tilawah_batch_id}
              kirimNyata={periode.kirim_nyata}
              outbox={await muatOutbox(periode.id)}
            />
          )}
        </div>
      </div>
    </main>
  );
}

async function muatOutbox(periodeId: string): Promise<BarisOutbox[]> {
  const { data: usulan } = await supabaseAdmin
    .from('ks_usulan')
    .select('id, nama_halaqah, status, slot:slot_id(label)')
    .eq('periode_id', periodeId);
  const info = new Map(
    ((usulan ?? []) as {
      id: string;
      nama_halaqah: string | null;
      status: string;
      slot?: { label: string } | null;
    }[]).map((u) => [u.id, u])
  );
  if (info.size === 0) return [];

  // Disaring per usulan periode ini di dalam kueri; tanpa itu 300 baris pertama
  // bisa seluruhnya milik periode lain.
  const { data } = await supabaseAdmin
    .from('ks_outbox')
    .select('id, usulan_id, aksi, status, percobaan, error_terakhir, payload, terkirim_pada')
    .in('usulan_id', [...info.keys()])
    .order('urutan', { ascending: true })
    .limit(300);

  return ((data ?? []) as {
    id: string;
    usulan_id: string;
    aksi: string;
    status: string;
    percobaan: number;
    error_terakhir: string | null;
    payload: Record<string, unknown>;
    terkirim_pada: string | null;
  }[])
    .filter((b) => info.has(b.usulan_id))
    .map((b) => {
      const u = info.get(b.usulan_id)!;
      return {
        id: b.id,
        halaqah: u.nama_halaqah ?? u.slot?.label ?? '—',
        aksi: b.aksi,
        status: b.status,
        percobaan: b.percobaan,
        error: b.error_terakhir,
        // Payload ditampilkan apa adanya: dalam mode percobaan inilah satu-satunya
        // cara koordinator memeriksa persis apa yang akan dikirim.
        payload: JSON.stringify(b.payload),
        terkirim_pada: b.terkirim_pada,
      };
    });
}
