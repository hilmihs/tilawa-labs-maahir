import Link from 'next/link';
import { requireKoordinator } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { Icon } from '@/components/icons';
import { SeedCard } from '@/components/SeedCard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function KoordinatorAdminPage() {
  await requireKoordinator();

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="topbar">
          <Link href="/2in1/koordinator" className="back">
            {Icon.back(12)} dashboard
          </Link>
          <LogoutButton />
        </div>

        <div className="page">
          <h1 className="t-h1" style={{ marginBottom: 4 }}>
            Admin & Seed
          </h1>
          <p className="t-small" style={{ marginBottom: 16 }}>
            Jalankan seed/reset langsung tanpa SSH ke server.
          </p>

          <div className="banner banner-error" style={{ marginBottom: 18 }}>
            <div>
              <div className="title">Catatan eksekusi</div>
              <div className="desc">
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  <li>Setiap eksekusi minta password koordinator sebagai konfirmasi.</li>
                  <li>
                    Operasi <strong>destruktif</strong> tidak bisa di-undo —
                    pastikan data benar sebelum menjalankan.
                  </li>
                  <li>
                    Seed besar (Itsnain, Maahir) bisa ~30 detik. Kalau timeout,
                    log tetap dilanjutkan di server — refresh setelah ~1 menit.
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section-row">
            <div className="t-tiny">Operasi destruktif</div>
            <div className="t-small">4 operasi</div>
          </div>

          <SeedCard
            seedKey="syaikh"
            title="Syaikh & Ustadzah"
            description="Wipe tabel syaikh, lalu insert ulang: Syaikh Ahmad Asy-Syahari (ikhwan) + Ustadzah Ruqayyah Haura Nugroho (akhwat). Password default password123."
            destructive
          />

          <SeedCard
            seedKey="itsnain"
            title="Akhwat — Itsnain Fi Wahid"
            description="Wipe semua data akhwat (peserta + kelas + musyrifah + setoran + file audio storage), lalu re-seed 5 musyrifah + 5 kelas Maahir (Alif/Ba/Dal/Ha pagi/Ha siang) + ~50 peserta akhwat. Ikhwan tidak disentuh."
            destructive
          />

          <SeedCard
            seedKey="maahir"
            title="Ikhwan — Maahir"
            description="Wipe semua data ikhwan (peserta + kelas + musyrif + setoran), lalu re-seed 5 musyrif + 5 kelas (Alif/Ba/Jim/Dal/Ha) + 40 peserta ikhwan. Akhwat tidak disentuh."
            destructive
          />

          <SeedCard
            seedKey="reset-setoran"
            title="Reset semua setoran"
            description="Hapus SEMUA setoran + rekaman (peserta dan musyrif). Akun + kelas tidak dihapus. File audio di storage TIDAK dihapus (jalankan cleanup-audio dari CLI terpisah)."
            destructive
          />

          <div className="section-row">
            <div className="t-tiny">HITS Matrix</div>
            <div className="t-small">3 operasi</div>
          </div>

          <SeedCard
            seedKey="hits"
            title="Seed HITS — Kelompok & Pengajar"
            description="Wipe semua data HITS (pengajar, kelompok, koordinator KK, checkin, observasi, dll), lalu re-seed 19 kelompok + 162 pengajar + 2 koordinator KK + 2 program kehadiran + demo data. Password default: hits123. Akun superadmin (koordinator KK) yang bukan bawaan akan di-restore otomatis."
            destructive
          />

          <SeedCard
            seedKey="kelas-hits"
            title="Seed Kelas HITS — 94 Kelas + Ketua Kelas"
            description="Wipe kelas_hits + ketua_kelas, lalu insert 28 kelas ikhwan + 66 kelas akhwat dari data Excel Juni 2025. Pengajar di-match by name, yang belum ada otomatis ditambahkan. Jadwal default: Senin-Jumat 16:00-19:00. Password ketua: hits123. Jalankan SETELAH seed HITS utama."
            destructive
          />

          <SeedCard
            seedKey="demo-observasi"
            title="Demo Observasi + Tabayyun + Checkin"
            description="Wipe observasi_kelas dan tabayyun, lalu generate 5 hari demo data: observasi kondisi kelas, tabayyun untuk non-KBBS, dan checkin pengajar. Jalankan SETELAH seed HITS + Kelas HITS."
            destructive
          />

          <div className="section-row">
            <div className="t-tiny">Operasi aman</div>
            <div className="t-small">1 operasi</div>
          </div>

          <SeedCard
            seedKey="peserta-password"
            title="Backfill password peserta"
            description="Set password 'maahir123' ke peserta yang password_hash NULL. Aditif — tidak menimpa password yang sudah ada. Aman dijalankan kapanpun."
            destructive={false}
          />
        </div>
      </div>
    </main>
  );
}
