import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-guard';
import { poolExec } from '@/lib/pg-core';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import DbAdmin from './DbAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminDbPage() {
  await requireAdmin();

  // Daftar tabel + estimasi baris (pg_stat_user_tables — murah, tak scan).
  // poolExec langsung (bukan shim) supaya tak diaudit tiap buka halaman.
  const { rows } = await poolExec(
    `SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY relname`
  );
  const tables = rows.map((r: any) => ({
    name: r.relname as string,
    rows: Number(r.n_live_tup ?? 0),
  }));

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20, paddingBottom: 80 }}>
          <div className="topbar">
            <div className="wordmark"><span className="mark">M</span> Superadmin — Konsol DB</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link href="/admin/users" className="btn btn-sm btn-ghost" style={{ height: 30, padding: '0 10px' }}>
                {Icon.back(12)} User
              </Link>
              <LogoutButton />
            </div>
          </div>

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Konsol Database</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 20 }}>
            <strong>Jelajah Tabel</strong>: cari/tambah/edit/hapus baris terpandu (aman untuk
            aduan sehari-hari). <strong>SQL Console</strong>: jalankan SQL apa pun. Tulis
            (UPDATE/DELETE/DDL) selalu preview jumlah baris dulu — commit hanya setelah
            kamu tekan tombol. Semua tercatat di log aktivitas.
          </p>

          <DbAdmin tables={tables} />
        </div>
      </div>
    </main>
  );
}
