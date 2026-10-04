import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { CreateKeyForm, RevokeButton } from './CreateKeyForm';

export const dynamic = 'force-dynamic';

function fmtDate(s: string | null): string {
  if (!s) return '—';
  return new Date(s).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 12px' };

export default async function ApiKeysPage() {
  await requireAdmin();
  const { data } = await supabaseAdmin
    .from('api_client')
    .select('id, nama, token_prefix, scopes, active, expires_at, last_used_at, request_count, revoked_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as any[];

  // Pemakaian per endpoint 30 hari: menjawab "endpoint mana yang sudah ditarik
  // konsumen", yang tidak terjawab oleh request_count per key.
  const sejak = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const { data: pakaiRows } = await supabaseAdmin
    .from('api_pemakaian_endpoint')
    .select('client_id, endpoint, jumlah, jumlah_gagal, terakhir')
    .gte('tanggal', sejak);
  const namaKey = new Map(rows.map((r) => [r.id as string, r.nama as string]));
  const pakai = new Map<string, { endpoint: string; key: string; jumlah: number; gagal: number; terakhir: string }>();
  for (const r of (pakaiRows ?? []) as any[]) {
    const kunci = `${r.endpoint}|${r.client_id}`;
    const ada = pakai.get(kunci) ?? {
      endpoint: r.endpoint as string,
      key: namaKey.get(r.client_id as string) ?? '(key terhapus)',
      jumlah: 0,
      gagal: 0,
      terakhir: '',
    };
    ada.jumlah += Number(r.jumlah ?? 0);
    ada.gagal += Number(r.jumlah_gagal ?? 0);
    if (String(r.terakhir) > ada.terakhir) ada.terakhir = String(r.terakhir);
    pakai.set(kunci, ada);
  }
  const pemakaian = [...pakai.values()].sort(
    (x, y) => y.terakhir.localeCompare(x.terakhir) || x.endpoint.localeCompare(y.endpoint)
  );
  const today = new Date().toISOString().slice(0, 10);
  const status = (r: any): 'aktif' | 'kedaluwarsa' | 'dicabut' =>
    !r.active ? 'dicabut' : r.expires_at && r.expires_at < today ? 'kedaluwarsa' : 'aktif';
  const badgeClass = (s: string): string =>
    s === 'aktif' ? 'badge badge-hijau' : s === 'kedaluwarsa' ? 'badge badge-kuning' : 'badge badge-merah';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — API Keys</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>User</Link>
              <Link href="/admin/db" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Konsol DB</Link>
              <Link href="/" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>Dashboard</Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>API Keys</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            Key konsumen API publik <code>/api/v1/*</code>. Key mentah hanya ditampilkan <strong>sekali</strong> saat dibuat — simpan baik-baik, tidak bisa dilihat ulang.
          </p>

          <CreateKeyForm />

          <p className="t-small" style={{ color: 'var(--muted-2)', margin: '24px 0 8px' }}>{rows.length} key</p>
          <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Nama</th>
                  <th style={th}>Prefix</th>
                  <th style={th}>Scope</th>
                  <th style={th}>Status</th>
                  <th style={th}>Terakhir dipakai</th>
                  <th style={th}>Req</th>
                  <th style={th} aria-label="aksi" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: '16px 12px', color: 'var(--muted-2)' }}>Belum ada key.</td>
                  </tr>
                )}
                {rows.map((r) => {
                  const s = status(r);
                  return (
                    <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.nama}</td>
                      <td style={{ ...td, color: 'var(--muted)', fontFamily: 'var(--font-mono), monospace' }}>{r.token_prefix}…</td>
                      <td style={td}>{(r.scopes ?? []).join(', ')}</td>
                      <td style={td}><span className={badgeClass(s)}>{s}</span></td>
                      <td style={{ ...td, color: 'var(--muted)' }}>{fmtDate(r.last_used_at)}</td>
                      <td style={td}>{r.request_count}</td>
                      <td style={td}>{r.active ? <RevokeButton id={r.id} /> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h2 className="t-h2" style={{ margin: '28px 0 4px', fontSize: 16 }}>Pemakaian per endpoint</h2>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
            30 hari terakhir, dihitung per key dan per endpoint. Parameter kueri tidak dicatat.
            Permintaan yang ditolak (scope kurang, entitas tak dikenal, parameter salah) masuk kolom Gagal.
          </p>
          <div className="card-flat" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={th}>Endpoint</th>
                  <th style={th}>Key</th>
                  <th style={th}>Permintaan</th>
                  <th style={th}>Gagal</th>
                  <th style={th}>Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {pemakaian.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '16px 12px', color: 'var(--muted-2)' }}>
                      Belum ada pemakaian tercatat. Pencatatan dimulai sejak fitur ini dipasang — pemakaian sebelumnya
                      tidak terekam.
                    </td>
                  </tr>
                )}
                {pemakaian.map((p) => (
                  <tr key={`${p.endpoint}|${p.key}`} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, fontFamily: 'var(--font-mono), monospace' }}>{p.endpoint}</td>
                    <td style={td}>{p.key}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{p.jumlah.toLocaleString('id-ID')}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums', color: p.gagal > 0 ? 'var(--merah-ink)' : undefined }}>
                      {p.gagal.toLocaleString('id-ID')}
                    </td>
                    <td style={{ ...td, color: 'var(--muted)' }}>{fmtDate(p.terakhir)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
