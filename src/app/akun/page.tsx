import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { Icon } from '@/components/icons';
import { musyrifTitle, syaikhTitle } from '@/lib/whatsapp';
import { ROLE_LANDING } from '@/lib/roles';
import type { Gender } from '@/types/db';

export const dynamic = 'force-dynamic';

function roleLabel(role: string, gender: Gender): string {
  if (role === 'musyrif') return musyrifTitle(gender);
  if (role === 'syaikh') return syaikhTitle(gender);
  if (role === 'peserta') return 'Peserta';
  if (role === 'koordinator') return 'Koordinator';
  if (role === 'pengajar') return 'Pengajar';
  if (role === 'ketua_kelas') return 'Ketua Kelas';
  if (role === 'koordinator_ketua_kelas') return 'Koordinator Ketua Kelas';
  return role;
}

export default async function AkunPage() {
  const s = await getSession();
  if (!s.session) redirect('/');
  const back = ROLE_LANDING[s.session.role] ?? '/';

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <div className="topbar">
          <Link href={back} className="back">
            {Icon.back(12)} kembali
          </Link>
          <span className="t-small">{roleLabel(s.session.role, s.session.gender)}</span>
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Pengaturan Akun
          </h1>
          <p className="t-body" style={{ marginBottom: 8 }}>
            {s.session.name}
          </p>

          <h2 className="t-h3" style={{ marginTop: 24, marginBottom: 10 }}>
            Ganti password
          </h2>
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  );
}
