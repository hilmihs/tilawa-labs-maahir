import 'server-only';
// Sumber "Kelas Maahir" untuk Rekap Pertemuan: dibaca langsung dari check-in
// pengajar Maahir di aplikasi ini (bukan Dashboard Edu — data Maahir di sana
// kosong). Sesi terjadwal diturunkan dari jadwal kelas dikurangi libur, sudah
// tanpa At-Tibyan, dan baru dilacak sejak CHECKIN_PENGAJAR_ANCHOR.

import { getSesiPengajar, type PengajarMaahirAkses, type SesiPengajar } from '@/lib/maahir-checkin-pengajar';
import { CHECKIN_PENGAJAR_ANCHOR, periodePengajarRange } from '@/lib/periode-pengajar';
import type { HalaqahPertemuan, PertemuanItem } from '@/lib/rekap-pertemuan';

function keItem(kelasId: string, s: SesiPengajar, idx: number): PertemuanItem {
  const status = s.checkin?.status ?? null;
  const berhalangan = status === 'izin' || status === 'sakit';
  return {
    id: `m:${kelasId}:${s.tanggal}`,
    tanggal: s.tanggal,
    urutan: idx + 1,
    selesai: status === 'hadir',
    konfirmasi: berhalangan ? 'tidak_mengajar' : null,
    alasan: berhalangan ? status : null,
  };
}

/**
 * Pertemuan kelas Maahir yang diampu dalam periode 16–15 `month`. Satu entri
 * per kelas yang diampu, termasuk kelas tanpa sesi di periode itu. Tak pernah
 * melempar galat: bila DB gagal, kembalikan daftar kosong.
 */
export async function getPertemuanMaahir(
  akses: PengajarMaahirAkses | null,
  month: string,
  hariIni: string
): Promise<{ aktif: boolean; sebelumAnchor: boolean; halaqah: HalaqahPertemuan[] }> {
  const sebelumAnchor = periodePengajarRange(month).end < CHECKIN_PENGAJAR_ANCHOR;
  if (!akses || akses.kelas.length === 0) return { aktif: false, sebelumAnchor, halaqah: [] };

  try {
    const sesi = await getSesiPengajar(akses, month, hariIni);
    const perKelas = new Map<string, SesiPengajar[]>();
    for (const s of sesi) {
      const arr = perKelas.get(s.kelasId);
      if (arr) arr.push(s);
      else perKelas.set(s.kelasId, [s]);
    }

    const halaqah: HalaqahPertemuan[] = akses.kelas.map((k) => {
      const daftar = (perKelas.get(k.id) ?? []).slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal));
      // Satu kelas bisa punya dua sesi di tanggal yang sama? Tidak — kunci
      // check-in per (kelas, tanggal). Tetap dedup supaya id unik.
      const unik = daftar.filter((s, i) => i === 0 || s.tanggal !== daftar[i - 1].tanggal);
      return {
        sumber: 'maahir',
        programKey: 'maahir',
        programNama: 'Kelas Maahir',
        halaqahNama: k.name,
        sebagaiBadal: false,
        guruUtama: null,
        cocokLewat: 'akun-maahir',
        tautan: '/kehadiran/pengajar-maahir',
        pertemuan: unik.map((s, i) => keItem(k.id, s, i)),
      };
    });

    return { aktif: true, sebelumAnchor, halaqah };
  } catch (e) {
    console.error('[rekap-pertemuan-maahir] gagal memuat sesi:', e instanceof Error ? e.message : String(e));
    return { aktif: true, sebelumAnchor, halaqah: [] };
  }
}
