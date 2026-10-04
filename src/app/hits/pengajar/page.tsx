import Link from 'next/link';
import { requirePengajar } from '@/lib/session';
import { getSessionWa } from '@/lib/program-kelas';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import { deriveHalaqahPertemuanWithOverrides, type PertemuanOverride } from '@/lib/hits-pertemuan';
import { todayJakarta } from '@/lib/maahir-presensi';
import { AssignKetuaPanel, type HalaqahForAssign } from './AssignKetuaStep';
import { PindahHalaqahPanel } from './PindahHalaqahPanel';
import { UbahLevelPanel } from './UbahLevelPanel';
import { TabayyunAlasanPanel, type TabayyunForPengajar } from './TabayyunAlasanForm';
import { getHitsBatches } from '@/lib/hits-rekap';
import { computeHutangForHalaqahList } from '@/lib/hits-hutang';

export const dynamic = 'force-dynamic';

export default async function HitsPengajarPage() {
  const session = await requirePengajar();
  const wa = await getSessionWa();
  const today = todayJakarta();
  const batches = await getHitsBatches();

  // Halaqah milik pengajar ini (via pengajar_id atau pengajar_wa).
  const orFilter = wa
    ? `pengajar_id.eq.${session.pengajar_id},pengajar_wa.eq.${wa}`
    : `pengajar_id.eq.${session.pengajar_id}`;
  const { data: halaqahRows } = await supabaseAdmin
    .from('hits_halaqah')
    .select('id, batch_id, level, name, jadwal_raw, jadwal_hari, gender, program')
    .eq('active', true)
    .or(orFilter);
  const halaqah = halaqahRows ?? [];

  let panelData: HalaqahForAssign[] = [];
  let tabayyunItems: TabayyunForPengajar[] = [];

  // Pengajuan pindah (transfer_out) yang masih pending untuk halaqah miliknya.
  const pendingByHalaqah = new Map<string, { target_name: string; target_wa: string | null }>();
  if (halaqah.length) {
    const { data: pendingReq } = await supabaseAdmin
      .from('hits_halaqah_pindah_request')
      .select('halaqah_id, target_name, target_wa')
      .in('halaqah_id', halaqah.map((h) => h.id))
      .eq('status', 'pending')
      .eq('request_type', 'transfer_out');
    for (const r of pendingReq ?? []) {
      pendingByHalaqah.set(r.halaqah_id as string, { target_name: r.target_name as string, target_wa: (r.target_wa as string) ?? null });
    }
  }
  const myHalaqah = halaqah.map((h) => ({
    id: h.id as string,
    name: h.name as string,
    gender: (h.gender as 'ikhwan' | 'akhwat' | null) ?? null,
    pending: pendingByHalaqah.get(h.id as string) ?? null,
  }));

  if (halaqah.length) {
    const halaqahIds = halaqah.map((h) => h.id);
    const batchIds = [...new Set(halaqah.map((h) => h.batch_id))];
    const halaqahNameById = new Map(halaqah.map((h) => [h.id, h.name]));

    // Tabayyun menunggu alasan/klarifikasi pengajar.
    const { data: tabRows } = await supabaseAdmin
      .from('hits_tabayyun')
      .select('id, halaqah_id, kondisi, status, alasan_pengajar, bayar_menit_klaim, bayar_catatan, izin_selisih_menit, hits_keterangan_harian:keterangan_id(tanggal, pertemuan_no)')
      .in('halaqah_id', halaqahIds)
      .in('status', ['pending', 'awaiting_reason'])
      .order('created_at', { ascending: false });
    const hutangByHal = await computeHutangForHalaqahList(halaqahIds);
    tabayyunItems = (tabRows ?? []).map((t) => {
      const ket = t.hits_keterangan_harian as unknown as { tanggal: string; pertemuan_no: number } | null;
      return {
        id: t.id,
        halaqah_name: halaqahNameById.get(t.halaqah_id) ?? '?',
        kondisi: t.kondisi as string,
        tanggal: ket?.tanggal ?? '—',
        pertemuan_no: ket?.pertemuan_no ?? 0,
        status: t.status,
        alasan_pengajar: t.alasan_pengajar,
        saldo_hutang: hutangByHal.get(t.halaqah_id)?.saldo ?? 0,
        bayar_menit_klaim: (t.bayar_menit_klaim as number | null) ?? null,
        bayar_catatan: (t.bayar_catatan as string | null) ?? null,
        izin_selisih_menit: (t.izin_selisih_menit as number | null) ?? 0,
      };
    });

    const [{ data: kaldikList }, { data: overrideList }, { data: pesertaList }, { data: ketuaKelasList }] = await Promise.all([
      supabaseAdmin
        .from('hits_kaldik_hari')
        .select('batch_id, level, tanggal, pekan, is_libur')
        .in('batch_id', batchIds),
      supabaseAdmin
        .from('hits_kaldik_pertemuan')
        .select('halaqah_id, pertemuan_no, tanggal, pekan, is_skipped')
        .in('halaqah_id', halaqahIds),
      supabaseAdmin
        .from('hits_halaqah_peserta')
        .select('id, halaqah_id, nama, is_ketua, status_peserta')
        .in('halaqah_id', halaqahIds)
        .eq('active', true)
        .order('nama'),
      supabaseAdmin
        .from('ketua_kelas')
        .select('id, name, hits_halaqah_id')
        .in('hits_halaqah_id', halaqahIds)
        .eq('active', true),
    ]);

    const kaldikByBL = new Map<string, { tanggal: string; pekan: number | null; is_libur: boolean }[]>();
    for (const r of kaldikList ?? []) {
      const key = `${r.batch_id}|${r.level}`;
      const arr = kaldikByBL.get(key) ?? [];
      arr.push({ tanggal: r.tanggal, pekan: r.pekan, is_libur: r.is_libur });
      kaldikByBL.set(key, arr);
    }
    const overridesByHalaqah = new Map<string, PertemuanOverride[]>();
    for (const o of overrideList ?? []) {
      const arr = overridesByHalaqah.get(o.halaqah_id) ?? [];
      arr.push({ pertemuan_no: o.pertemuan_no, tanggal: o.tanggal, pekan: o.pekan, is_skipped: o.is_skipped });
      overridesByHalaqah.set(o.halaqah_id, arr);
    }
    const pesertaByHalaqah = new Map<string, { id: string; nama: string }[]>();
    for (const p of pesertaList ?? []) {
      const arr = pesertaByHalaqah.get(p.halaqah_id) ?? [];
      arr.push({ id: p.id, nama: p.nama });
      pesertaByHalaqah.set(p.halaqah_id, arr);
    }
    // Ketua aktif bersumber dari ketua_kelas (punya login), bukan is_ketua di peserta.
    const ketuaByHalaqah = new Map<string, string>();
    for (const kk of ketuaKelasList ?? []) {
      ketuaByHalaqah.set(kk.hits_halaqah_id as string, kk.name as string);
    }

    panelData = halaqah.map((h) => {
      let pertemuanCount = 0;
      if (h.level) {
        const kaldik = kaldikByBL.get(`${h.batch_id}|${h.level}`) ?? [];
        const derived = deriveHalaqahPertemuanWithOverrides(
          h.jadwal_hari ?? [],
          kaldik,
          overridesByHalaqah.get(h.id) ?? []
        );
        pertemuanCount = derived.filter((d) => d.tanggal <= today).length;
      }
      return {
        id: h.id,
        name: h.name,
        levelTagged: !!h.level,
        pertemuanCount,
        currentKetua: ketuaByHalaqah.get(h.id) ?? null,
        peserta: pesertaByHalaqah.get(h.id) ?? [],
      };
    });
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>
          <div className="topbar">
            <div className="wordmark">
              <span className="mark">H</span> Tunjuk Ketua Kelas
            </div>
            <LogoutButton />
          </div>


          <TabayyunAlasanPanel items={tabayyunItems} />

          <h1 className="t-h1" style={{ marginBottom: 4 }}>Penunjukan Ketua Kelas</h1>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
            Tunjuk satu peserta tiap halaqah menjadi ketua kelas. Ketua bertugas mengisi
            keterangan pengajar & latihan tiap pertemuan.
          </p>

          {panelData.length === 0 ? (
            <p className="t-small" style={{ color: 'var(--muted-2)' }}>
              Belum ada halaqah HITS terhubung dengan akun Anda. Hubungi koordinator ketua kelas.
            </p>
          ) : (
            <AssignKetuaPanel halaqahList={panelData} />
          )}

          <UbahLevelPanel halaqahList={halaqah.map((h) => ({
            id: h.id as string,
            name: h.name as string,
            program: (h.program as 'dasar' | 'lanjutan' | null) ?? null,
          }))} />

          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
            <h2 className="t-h2" style={{ marginBottom: 4 }}>Pemindahan Halaqah</h2>
            <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 8 }}>
              Ajukan pemindahan halaqah ke pengajar lain. Pengajar tujuan menyetujui via tautan (perlu login),
              lalu halaqah otomatis pindah.
            </p>
            <PindahHalaqahPanel batches={batches} myHalaqah={myHalaqah} />
          </div>

          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 20 }}>
            <Link href="/kehadiran/pengajar">← Kembali ke Kehadiran</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
