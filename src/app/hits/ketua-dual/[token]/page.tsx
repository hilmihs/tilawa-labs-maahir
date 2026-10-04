import { supabaseAdmin } from '@/lib/supabase-admin';
import { getSession } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { buildWaMeUrl, tplKetuaDualRoleInfo, tplKetuaDualRoleDisetujui } from '@/lib/whatsapp';
import { absUrl } from '@/lib/url';
import { DecideDualRolePanel } from './DecideDualRolePanel';

export const dynamic = 'force-dynamic';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span className="t-small" style={{ color: 'var(--muted-2)' }}>{label}</span>
      <span className="t-small" style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default async function KetuaDualRolePage({ params }: { params: { token: string } }) {
  const s = await getSession();
  const accesses = s.accesses ?? (s.session ? [s.session] : []);
  const wa = await getSessionWa();
  const { token } = params;

  const { data: req } = await supabaseAdmin
    .from('ketua_dualrole_request')
    .select('*, halaqah:new_halaqah_id(name)')
    .eq('token', token)
    .maybeSingle();

  if (!req) {
    return (
      <main style={{ minHeight: '100vh' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }} className="page">
          <h1 className="t-h1">Pengajuan tidak ditemukan</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)' }}>Link tidak valid.</p>
        </div>
      </main>
    );
  }

  const halaqah = req.halaqah as unknown as { name: string } | null;

  // Apakah sesi ini berhak (untuk pesan; aksi tetap di-guard server).
  const isApprover =
    req.approver_kind === 'pengajar'
      ? (!!req.target_pengajar_id && accesses.some((a) => a.role === 'pengajar' && a.pengajar_id === req.target_pengajar_id)) ||
        (!!req.target_wa && !!wa && wa === req.target_wa)
      : accesses.some((a) => a.role === 'koordinator_ketua_kelas') || (!!req.target_wa && !!wa && wa === req.target_wa);

  const approverLabel = req.approver_kind === 'pengajar' ? 'Pengajar halaqah lama' : 'Koordinator Ketua Kelas';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', paddingTop: 24 }} className="page">
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Persetujuan Peran Ganda Ketua</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
          Ketua kelas memimpin lebih dari satu halaqah
        </p>

        <div className="card-flat" style={{ padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Row label="Ketua" value={req.ketua_name} />
          <Row label="Halaqah baru" value={halaqah?.name ?? '—'} />
          <Row label="Diajukan oleh" value={req.requested_by_name} />
          <Row label="Persetujuan oleh" value={`${approverLabel}${req.target_name ? ` (${req.target_name})` : ''}`} />
        </div>

        {req.status !== 'pending' ? (
          (() => {
            const ketuaWaUrl = req.status === 'approved'
              ? buildWaMeUrl(req.ketua_wa, tplKetuaDualRoleInfo({ ketuaName: req.ketua_name, newHalaqahName: halaqah?.name ?? 'halaqah', loginUrl: absUrl('/') }))
              : null;
            const pengajarWaUrl = req.status === 'approved' && req.requested_by_wa
              ? buildWaMeUrl(req.requested_by_wa, tplKetuaDualRoleDisetujui({ pengajarName: req.requested_by_name ?? 'Pengajar', ketuaName: req.ketua_name, newHalaqahName: halaqah?.name ?? 'halaqah' }))
              : null;
            return (
              <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
                <p className="t-body" style={{ fontWeight: 600, color: req.status === 'approved' ? 'var(--hijau-ink)' : 'var(--danger)' }}>
                  {req.status === 'approved' ? 'Sudah disetujui.' : 'Sudah ditolak.'}
                </p>
                {ketuaWaUrl && (
                  <a href={ketuaWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-block" style={{ marginTop: 12 }}>
                    Infokan auth ke ketua via WhatsApp
                  </a>
                )}
                {pengajarWaUrl && (
                  <a href={pengajarWaUrl} target="_blank" rel="noopener noreferrer" className="btn btn-wa btn-block" style={{ marginTop: 8 }}>
                    Beritahu pengajar (sudah disetujui)
                  </a>
                )}
              </div>
            );
          })()
        ) : isApprover ? (
          <DecideDualRolePanel token={token} status={req.status} catatan={req.catatan} />
        ) : (
          <div className="card-flat" style={{ padding: 16 }}>
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Hanya {approverLabel.toLowerCase()} yang bisa menyetujui. Pastikan Anda login dengan akun yang benar
              {req.target_name ? ` (${req.target_name})` : ''}.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
