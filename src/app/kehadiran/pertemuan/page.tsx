import type { ReactNode } from 'react';
import { jagaRekapPertemuan, terdaftarDiDashboardEdu } from '@/lib/rekap-pertemuan-akses';
import { getPertemuanMaahir } from '@/lib/rekap-pertemuan-maahir';
import { getPertemuanHilmihsUntuk } from '@/lib/rekap-pertemuan-snapshot';
import {
  gabungProgram,
  geserPeriode,
  hariIniWib,
  labelAlasan,
  periodePertemuanOptions,
  periodeValid,
  statusItem,
  type PertemuanItem,
  type StatusPertemuan,
} from '@/lib/rekap-pertemuan';
import { periodePengajarLabel, periodePengajarRange } from '@/lib/periode-pengajar';
import { FiturHeader } from '@/components/FiturHeader';
import { MonthNavSelect } from '@/components/MonthNavSelect';
import { TombolPerbarui } from './TombolPerbarui';
import { RekapView, type BarisPertemuan, type SinkronInfo, type StatusTampil } from './RekapView';

// Rekap jumlah pertemuan tiap program & halaqah yang diajar pengajar, per
// periode 16–15. Sumber: snapshot Dashboard Edu (disinkron beberapa kali
// sehari, bukan ditarik tiap buka halaman) + check-in Kelas Maahir langsung.
// Identitas (WA/kunci) hanya dipakai di server — tak pernah dirender.

export const dynamic = 'force-dynamic';

// Warna penanda tiap halaqah (dipakai bergiliran).
const WARNA_HALAQAH = [
  'var(--accent)',
  'oklch(0.72 0.11 80)',
  'oklch(0.55 0.08 250)',
  'oklch(0.62 0.12 20)',
  'oklch(0.58 0.1 300)',
  'oklch(0.62 0.09 200)',
];

/** '29 Sep, 11.30 WIB' dari ISO. */
function waktuWib(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = d.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${s} WIB`;
}

function statusTampil(it: PertemuanItem, hariIni: string): StatusTampil {
  const st: StatusPertemuan = statusItem(it, hariIni);
  switch (st) {
    case 'selesai':
      return 'selesai';
    case 'dikonfirmasi':
      return 'dikonfirmasi';
    case 'berhalangan':
      return 'berhalangan';
    case 'terlewat':
      return 'belum';
    default:
      return it.tanggal === hariIni ? 'hari_ini' : 'terjadwal';
  }
}

function Catatan({ children }: { children: ReactNode }) {
  return (
    <div className="rp-kartu" style={{ padding: '12px 14px' }}>
      <div className="t-small">{children}</div>
    </div>
  );
}

export default async function RekapPertemuanPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const id = await jagaRekapPertemuan();
  const hariIni = hariIniWib();
  const month = periodeValid(searchParams.month, hariIni);

  const [h, m] = await Promise.all([
    getPertemuanHilmihsUntuk({ kunciMentah: id.kunciMentah, namaAkun: id.namaAkun }, month),
    getPertemuanMaahir(id.aksesMaahir, month, hariIni),
  ]);
  const programs = gabungProgram([...h.halaqah, ...m.halaqah]);
  const { start, end } = periodePengajarRange(month);

  // Satu baris per pertemuan, diurut tanggal — bahan tampilan Daftar & Kalender.
  const baris: BarisPertemuan[] = [];
  let iWarna = 0;
  for (const p of programs) {
    for (const x of p.halaqah) {
      const warna = WARNA_HALAQAH[iWarna++ % WARNA_HALAQAH.length];
      // "Dicocokkan lewat nama" disebut sekali di kartu sinkron, bukan per baris.
      const keterangan = x.sebagaiBadal ? `badal untuk ${x.guruUtama ?? 'pengajar lain'}` : null;
      for (const it of x.pertemuan) {
        const status = statusTampil(it, hariIni);
        baris.push({
          id: `${x.sumber}|${x.programKey}|${x.halaqahNama}|${it.id}`,
          tanggal: it.tanggal,
          urutan: it.urutan,
          status,
          alasan: status === 'berhalangan' ? labelAlasan(it.alasan) : null,
          halaqahNama: x.halaqahNama,
          programNama: p.programNama,
          warna,
          keterangan,
        });
      }
    }
  }
  baris.sort((a, b) => (a.tanggal !== b.tanggal ? (a.tanggal < b.tanggal ? -1 : 1) : (a.urutan ?? 0) - (b.urutan ?? 0)));

  const hitung = (...st: StatusTampil[]) => baris.filter((b) => st.includes(b.status)).length;
  const cSelesai = hitung('selesai', 'dikonfirmasi');
  const cBelum = hitung('belum');
  const cBerhalangan = hitung('berhalangan');
  const cHariIni = hitung('hari_ini');
  const cMendatang = hitung('terjadwal');
  const total = baris.length;
  const jumlahHalaqah = programs.reduce((n, p) => n + p.halaqah.length, 0);

  const totalHari = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  const hariKe = Math.round((Date.parse(hariIni) - Date.parse(start)) / 86_400_000) + 1;
  const keteranganHari =
    hariKe < 1 ? 'Periode belum dimulai' : hariKe > totalHari ? 'Periode sudah selesai' : `Hari ke-${hariKe} dari ${totalHari}`;

  const pct = (v: number) => (total ? `${((v / total) * 100).toFixed(2)}%` : '0%');
  const bar = [
    { l: 'Selesai', n: cSelesai, c: 'oklch(0.78 0.12 150)' },
    { l: 'Belum diinput', n: cBelum, c: 'oklch(0.72 0.15 25)' },
    ...(cBerhalangan > 0 ? [{ l: 'Berhalangan', n: cBerhalangan, c: 'oklch(0.75 0.08 250)' }] : []),
    { l: 'Hari ini', n: cHariIni, c: 'var(--emas)' },
    { l: 'Mendatang', n: cMendatang, c: 'rgba(255,255,255,0.38)' },
  ];

  const options = periodePertemuanOptions(hariIni);
  const ada = new Set(options.map((o) => o.value));
  const sebelum = geserPeriode(month, -1);
  const sesudah = geserPeriode(month, 1);

  const hilmihsKosong = h.status === 'kosong';
  const adaHalaqahEdu = h.halaqah.length > 0;
  const adaCocokNama = h.halaqah.some((x) => x.cocokLewat === 'nama');
  // Tak cocok di laporan periode ini belum tentu akunnya tak dikenal: laporan
  // hanya memuat guru yang berjadwal. Tercatat di Dashboard Edu ⇒ "tak ada jadwal".
  const terdaftarEdu = !hilmihsKosong && !h.dicocokkan && (await terdaftarDiDashboardEdu(id.kunciMentah));
  const akunTakDitemukan = !hilmihsKosong && !h.dicocokkan && !terdaftarEdu && (!!id.pengajarId || !m.aktif);
  const tanpaJadwalEdu = !hilmihsKosong && (h.dicocokkan || terdaftarEdu) && !adaHalaqahEdu;

  const sinkron: SinkronInfo = h.gagalTerakhir
    ? { nada: 'merah', label: 'Gagal terhubung', desc: `Menampilkan data terakhir${h.syncedAt ? ` (per ${waktuWib(h.syncedAt)})` : ''}.` }
    : hilmihsKosong
      ? { nada: 'kuning', label: 'Belum tersinkron', desc: 'Data Dashboard Edu belum tersedia. Coba tekan Perbarui.' }
      : akunTakDitemukan
        ? { nada: 'merah', label: 'Akun tidak ditemukan', desc: `Dicek ${h.syncedAt ? waktuWib(h.syncedAt) : '—'}.` }
        : {
            nada: h.status === 'basi' ? 'kuning' : 'hijau',
            label: h.status === 'basi' ? 'Data lama' : 'Tersinkron',
            desc: `Data per ${h.syncedAt ? waktuWib(h.syncedAt) : '—'} · otomatis beberapa kali sehari${m.aktif ? ' · Kelas Maahir langsung dari check-in' : ''}${adaCocokNama ? ' · sebagian halaqah dicocokkan lewat nama' : ''}`,
          };

  function navPeriode(target: string, label: string, simbol: string) {
    if (!ada.has(target)) {
      return (
        <span className="rp-nav" aria-disabled="true" style={{ opacity: 0.35 }}>
          {simbol}
        </span>
      );
    }
    return (
      <a href={`?month=${target}`} className="rp-nav" aria-label={label}>
        {simbol}
      </a>
    );
  }

  return (
    <main style={{ minHeight: '100vh' }}>
      <div className="rp-wadah">
        <FiturHeader
          ikon="grafik"
          judul="Rekap Pertemuan"
          sub={`${id.nama}${jumlahHalaqah ? ` · ${jumlahHalaqah} kelas` : ''}`}
          menumpang
          kanan={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {navPeriode(sebelum, 'Periode sebelumnya', '‹')}
              <span className="rp-periode">
                <MonthNavSelect options={options} value={month} />
              </span>
              {navPeriode(sesudah, 'Periode berikutnya', '›')}
            </div>
          }
        >
          <div className="rp-hero">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
                <span className="rp-hero-besar">{total ? `${cSelesai}/${cSelesai + cBelum}` : '–'}</span>{' '}
                {total ? 'pertemuan terlaksana s/d hari ini' : 'belum ada data pertemuan'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--emas)', fontWeight: 600 }}>{keteranganHari}</div>
            </div>
            <div className="rp-bar" aria-hidden>
              {bar.map((s) => (s.n > 0 ? <div key={s.l} style={{ width: pct(s.n), background: s.c }} /> : null))}
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, color: 'rgba(255,255,255,0.78)' }}>
              {bar.map((s) => (
                <span key={s.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: s.c }} />
                  {s.l} <b style={{ color: '#fff' }}>{total ? s.n : '–'}</b>
                </span>
              ))}
            </div>
          </div>
        </FiturHeader>

        <div className="page rp-isi">
          <div className="rp-stat fh-tumpang">
            {[
              { l: 'Terlaksana', v: total ? `${cSelesai}/${cSelesai + cBelum}` : '–', sub: 'pertemuan s/d hari ini', dot: 'var(--hijau)', merah: false },
              { l: 'Belum diinput', v: total ? String(cBelum) : '–', sub: 'sudah lewat, belum ditandai', dot: 'var(--merah)', merah: cBelum > 0 },
              { l: 'Mendatang', v: total ? String(cHariIni + cMendatang) : '–', sub: 'termasuk hari ini', dot: 'var(--emas)', merah: false },
              { l: 'Terjadwal periode', v: total ? String(total) : '–', sub: `total jadwal ${periodePengajarLabel(month)}`, dot: 'var(--muted-2)', merah: false },
            ].map((k) => (
              <div key={k.l} className={`rp-statkartu${k.merah ? ' merah' : ''}`}>
                <div className="rp-statlabel">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: k.dot }} />
                  {k.l}
                </div>
                <div className="rp-statnilai">{k.v}</div>
                <div className="rp-redup" style={{ lineHeight: 1.35 }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {akunTakDitemukan && (
            <div className="rp-takditemukan">
              <div className="rp-takditemukan-ikon" aria-hidden>!</div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Akun Anda belum ditemukan di Dashboard Edu</div>
                <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-2)' }}>
                  Rekap periode ini belum bisa ditampilkan. Penyebab paling umum:
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-2)', listStyle: 'disc' }}>
                  <li>Nomor WhatsApp di Dashboard Edu berbeda dengan nomor akun Maahir</li>
                  <li>Nama tercatat berbeda (ejaan atau gelar)</li>
                </ul>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                  <a href="/shakwa" className="btn btn-sm btn-wa" style={{ height: 40, textDecoration: 'none' }}>
                    Sampaikan ke koordinator
                  </a>
                  <TombolPerbarui month={month} />
                </div>
              </div>
            </div>
          )}
          {hilmihsKosong && !m.aktif && (
            <Catatan>Data Dashboard Edu belum tersedia. Coba tekan Perbarui beberapa saat lagi.</Catatan>
          )}
          {tanpaJadwalEdu && !m.aktif && (
            <Catatan>Tidak ada jadwal halaqah Anda di Dashboard Edu pada periode ini.</Catatan>
          )}
          {m.aktif && m.sebelumAnchor && <Catatan>Check-in Kelas Maahir baru dicatat sejak 16 Sep 2026.</Catatan>}

          <RekapView
            baris={baris}
            hariIni={hariIni}
            start={start}
            end={end}
            month={month}
            sinkron={sinkron}
            adaData={baris.length > 0}
          />
        </div>
      </div>
    </main>
  );
}
