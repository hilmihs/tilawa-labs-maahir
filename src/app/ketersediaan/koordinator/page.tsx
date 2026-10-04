import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { requireOneOfRoles } from '@/lib/session';
import { LogoutButton } from '@/components/LogoutButton';
import { isSuperadmin } from '@/lib/admin-guard';
import { listPeriode, listSlot } from '@/lib/ketersediaan-periode';
import { ringkasSlot } from '@/lib/ketersediaan-permintaan';
import { listPreset } from '@/lib/ketersediaan-prioritas';
import { daftarDipakai, listKelayakan, ringkasKelayakan, urutkanKelayakan } from '@/lib/ketersediaan-kelayakan';
import { ringkasDitahan } from '@/lib/ketersediaan-ditahan';
import {
  jumlahkan,
  susunArus,
  susunBarisJam,
  susunPeta,
  susunRincianLevel,
  tanggalBatasAntrean,
  terapkanSimulasi,
  type BarisJam,
} from '@/lib/ketersediaan-dasbor';
import type { Gender, KsPeriode } from '@/types/db';
import { PanelPeriode, PeriodeBaru } from './PanelPeriode';
import { PanelSlot } from './PanelSlot';
import { PanelKerja } from './PanelKerja';
import { PanelPendaftar } from './PanelPendaftar';
import { PanelPengingat } from './PanelPengingat';
import { PanelGrupPool } from './PanelGrupPool';
import { PanelDitahan } from './PanelDitahan';
import { PanelImpor } from './PanelImpor';
import { PanelKelayakan } from './PanelKelayakan';
import {
  hitungPengajarTersedia,
  muatAntrean,
  muatGrupPool,
  muatPendaftarLevel,
  muatPendaftarRingkas,
  muatPengajarDasbor,
  muatSumber,
  muatTugas,
  muatUsulan,
  BATAS_USULAN,
  type TugasGender,
} from './data';
import { bacaGender, bacaTab, tautanDasbor, type TabDasbor } from './dasbor/navigasi';
import { KepalaDasbor, PERIODE_GABUNGAN } from './dasbor/KepalaDasbor';
import { susunGabungan } from '@/lib/ketersediaan-gabungan';
import { TabRingkasan, type ButirTugas, type PetaBerjudul } from './dasbor/TabRingkasan';
import { TabJam } from './dasbor/TabJam';
import { RincianOffline } from './dasbor/RincianOffline';
import { DaftarPengajar } from './dasbor/DaftarPengajar';
import { ArusPendaftarChart } from './dasbor/ArusPendaftarChart';

export const dynamic = 'force-dynamic';

const fmt = (n: number) => n.toLocaleString('id-ID');

/**
 * Heatmap selalu per gender: jam ikhwan dan akhwat yang sama tidak boleh
 * dijumlah, karena pengajarnya tidak bisa saling menggantikan.
 */
function petaPerGender(baris: readonly BarisJam[], g: 'semua' | Gender): PetaBerjudul[] {
  if (g !== 'semua') return [{ judul: null, peta: susunPeta(baris) }];
  return (['ikhwan', 'akhwat'] as const).map((x) => ({
    judul: x === 'ikhwan' ? 'Ikhwan' : 'Akhwat',
    peta: susunPeta(baris.filter((b) => b.kelompok === x)),
  }));
}

export default async function KetersediaanKoordinatorPage({
  searchParams,
}: {
  searchParams: { periode?: string; tab?: string; g?: string };
}) {
  const sesi = await requireOneOfRoles(['koordinator']);

  const superadmin = await isSuperadmin();
  const sekarang = new Date();
  const semuaPeriode = await listPeriode();
  const tab = bacaTab(searchParams.tab);
  const g = bacaGender(searchParams.g, superadmin ? 'semua' : sesi.gender);

  const periode =
    semuaPeriode.find((p) => p.id === searchParams.periode) ??
    semuaPeriode.find((p) => p.aktif) ??
    semuaPeriode[0] ??
    null;

  if (!periode) {
    return (
      <Bingkai>
        <Kop />
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Kelola Ketersediaan Mengajar</h1>
        <p className="t-small" style={{ color: 'var(--muted)', marginBottom: 16 }}>
          Belum ada periode. Buat satu periode per batch KBM — misalnya Batch September 2026 dan Batch Oktober 2026 —
          lalu impor ketersediaan pengajar dari xlsx di tab Pengaturan.
        </p>
        <PeriodeBaru />
      </Bingkai>
    );
  }

  const tahapAktif = semuaPeriode.filter((p) => p.aktif);
  if (searchParams.periode === PERIODE_GABUNGAN && tahapAktif.length >= 2) {
    return (
      <HalamanGabungan
        tahap={tahapAktif}
        semuaPeriode={semuaPeriode}
        tab={tab === 'jam' ? 'jam' : 'ringkasan'}
        g={g}
        sekarang={sekarang}
      />
    );
  }

  const slots = await listSlot(periode.id);
  const slotAktif = slots.filter((s) => s.aktif);
  const [ringkas, pengajarSemua, tugas, pendaftarSemua] = await Promise.all([
    ringkasSlot(periode, slotAktif, sekarang),
    muatPengajarDasbor(periode.id),
    muatTugas(periode.id, sekarang),
    muatPendaftarRingkas(periode.id),
  ]);

  const saring = <T,>(xs: readonly T[], genderDari: (x: T) => Gender | null): T[] =>
    g === 'semua' ? [...xs] : xs.filter((x) => genderDari(x) === g);

  // Ringkasan dan tab jam memakai daya tampung hasil simulasi alokasi (sama
  // dengan pandangan gabungan), bukan perkiraan pengajar × kapasitas yang
  // menghitung pengajar banyak-jam berulang. Tab lain tak menampilkannya, jadi
  // simulasinya — yang mahal — tidak dijalankan di sana.
  const perkiraan = susunBarisJam(slotAktif, ringkas, periode.kapasitas_halaqah);
  const jamSemua =
    tab === 'ringkasan' || tab === 'jam'
      ? terapkanSimulasi(perkiraan, (await susunGabungan([periode], sekarang)).tampungSim, periode.kapasitas_halaqah)
      : perkiraan;
  const jam = saring(jamSemua, (b) => b.kelompok);
  const pengajar = saring(pengajarSemua, (p) => p.gender);
  const pendaftar = saring(pendaftarSemua, (p) => p.gender);

  // Pendaftar ditahan dihitung dari barisnya, bukan per jam: sebagian besar
  // tertahan justru karena jamnya tidak terbaca, jadi tak punya slot.
  const tertahanUntuk = (gender?: Gender) =>
    pendaftarSemua.filter((p) => p.status === 'ditahan' && (!gender || p.gender === gender)).length;
  const angkaUntuk = (baris: readonly BarisJam[], gender?: Gender) => ({
    ...jumlahkan(baris),
    tertahan: tertahanUntuk(gender),
    pengajar: hitungPengajarTersedia(pengajarSemua, gender),
  });
  const angka = angkaUntuk(jam, g === 'semua' ? undefined : g);
  const pecah =
    g === 'semua'
      ? {
          ikhwan: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'ikhwan'), 'ikhwan'),
          akhwat: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'akhwat'), 'akhwat'),
        }
      : null;

  const tugasG: TugasGender =
    g === 'semua'
      ? {
          usulanMenunggu: tugas.ikhwan.usulanMenunggu + tugas.akhwat.usulanMenunggu,
          tenggatLewat: tugas.ikhwan.tenggatLewat + tugas.akhwat.tenggatLewat,
          sanggahan: tugas.ikhwan.sanggahan + tugas.akhwat.sanggahan,
          ditolak: tugas.ikhwan.ditolak + tugas.akhwat.ditolak,
          gagal: tugas.ikhwan.gagal + tugas.akhwat.gagal,
        }
      : tugas[g];

  const href = (t: TabDasbor) => tautanDasbor({ periode: periode.id, tab: t, g });
  const tanpaPengajar = jam.filter((b) => b.status === 'tanpa_pengajar');
  const kurangPengajar = jam.filter((b) => b.status === 'kurang');

  const butir: ButirTugas[] = [];
  if (slotAktif.length === 0) {
    butir.push({
      nada: 'aksen',
      judul: 'Periode ini belum punya jam',
      desk: 'Impor ketersediaan pengajar dari xlsx untuk mengisi master jam.',
      href: href('pengaturan'),
      label: 'Buka impor',
    });
  }
  if (tanpaPengajar.length > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tanpaPengajar.length} jam tanpa pengajar sama sekali`,
      desk: `${fmt(tanpaPengajar.reduce((a, b) => a + b.antre, 0))} pendaftar menunggu di jam itu dan belum bisa dibentuk halaqahnya.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }
  if (tugasG.tenggatLewat > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tugasG.tenggatLewat} konfirmasi pengajar lewat tenggat`,
      desk: 'Belum digeser ke pengajar berikutnya. Jalankan "Sapu yang lewat tenggat".',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (tugasG.ditolak + tugasG.gagal > 0) {
    butir.push({
      nada: 'merah',
      judul: [
        tugasG.ditolak > 0 ? `${tugasG.ditolak} usulan ditolak pengajar` : null,
        tugasG.gagal > 0 ? `${tugasG.gagal} gagal dikirim ke CMS tilawah` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      desk: 'Lihat alasannya di Riwayat usulan. Usulan yang masih memegang peserta perlu dibatalkan supaya muridnya kembali antre.',
      href: href('usulan'),
      label: 'Buka riwayat',
    });
  }
  if (tugasG.usulanMenunggu > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.usulanMenunggu} usulan halaqah menunggu dilepas`,
      desk: 'Pengajar belum dihubungi sampai usulannya dilepas.',
      href: href('usulan'),
      label: 'Buka usulan',
    });
  }
  if (angka.tertahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${fmt(angka.tertahan)} pendaftar ditahan`,
      desk: 'Tidak ikut dihitung sampai diperiksa: jam tak terbaca, nomor tidak sah, atau umur di luar batas.',
      href: href('pendaftar'),
      label: 'Periksa',
    });
  }
  if (tugasG.sanggahan > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${tugasG.sanggahan} sanggahan jadwal menunggu`,
      desk: 'Pengajar menyatakan jadwal yang mengunci jamnya sudah selesai.',
      href: href('usulan'),
      label: 'Putuskan',
    });
  }
  if (kurangPengajar.length > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${kurangPengajar.length} jam kekurangan pengajar`,
      desk: `${fmt(kurangPengajar.reduce((a, b) => a + b.sisa, 0))} pendaftar belum tertampung walau jamnya punya pengajar.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }

  let isi: ReactNode;
  if (tab === 'ringkasan') {
    isi = (
      <TabRingkasan
        angka={angka}
        pecah={pecah}
        tugas={butir}
        teratas={jam.filter((b) => b.sisa > 0).slice(0, 5)}
        peta={petaPerGender(jam, g)}
        hrefJam={href('jam')}
        tampilGender={g === 'semua'}
        ketTampung="Hasil simulasi alokasi dengan pengajar periode ini. Pengajar yang menyanggupi banyak jam tidak dihitung berulang, dan hanya kelompok level & umur yang genap yang dihitung."
      />
    );
  } else if (tab === 'jam') {
    const pendaftarLevel = await muatPendaftarLevel(periode.id);
    const bebas = new Map(
      [...ringkas.values()].map((r) => [r.slot_id, Math.max(0, r.pengajar_tersedia - r.pengajar_terpakai)])
    );
    const offline = saring(
      slotAktif.filter((s) => s.mode === 'offline'),
      (s) => s.kelompok
    ).sort((a, b) => (a.lokasi ?? '').localeCompare(b.lokasi ?? '') || a.label.localeCompare(b.label));
    const rincian = susunRincianLevel(offline, pendaftarLevel, bebas, periode, sekarang);
    isi = (
      <>
        <TabJam baris={jam} tampilGender={g === 'semua'} />
        <div className="ks-isi" style={{ marginTop: 16 }}>
          <RincianOffline baris={rincian} tampilGender={g === 'semua'} />
        </div>
      </>
    );
  } else if (tab === 'pengajar') {
    isi = <DaftarPengajar baris={pengajar} tampilGender={g === 'semua'} />;
  } else if (tab === 'pendaftar') {
    const [ditahan, sumber] = await Promise.all([
      ringkasDitahan(periode.id, { gender: g === 'semua' ? undefined : g }),
      muatSumber(periode.id),
    ]);
    const arus = susunArus(pendaftar);
    isi = (
      <div className="ks-isi">
        <div className="ks-kartu">
          <div className="ks-kartu-kepala">
            <h2>Arus pendaftar</h2>
            <p>{fmt(pendaftar.length)} pendaftar di periode ini</p>
          </div>
          <div className="ks-kartu-isi">
            <ArusPendaftarChart
              data={arus}
              tampil={g === 'semua' ? ['ikhwan', 'akhwat'] : [g]}
              batasAntrean={tanggalBatasAntrean(arus[0]?.tanggal ?? null, periode.usia_antrean_maks_hari)}
            />
          </div>
        </div>
        <PanelDitahan key={`ditahan-${periode.id}-${g}`} periodeId={periode.id} ringkas={ditahan} />
        <PanelPendaftar key={`pendaftar-${periode.id}`} periodeId={periode.id} sumber={sumber} />
      </div>
    );
  } else if (tab === 'usulan') {
    const [antrean, usulan, preset, grupPool] = await Promise.all([
      muatAntrean(periode.id),
      muatUsulan(periode.id),
      listPreset(),
      muatGrupPool(periode.id),
    ]);
    isi = (
      <div className="ks-isi">
        <PanelKerja
          key={`kerja-${periode.id}`}
          periodeId={periode.id}
          antrean={saring(antrean, (b) => b.gender)}
          usulan={saring(usulan.kartu, (u) => u.gender)}
          terpotong={usulan.terpotong}
          batas={BATAS_USULAN}
          preset={preset.map((p) => ({ id: p.id, nama: p.nama, gender: p.gender, tipe: p.tipe }))}
        />
        <PanelGrupPool key={`grup-${periode.id}`} periodeId={periode.id} baris={saring(grupPool, (b) => b.gender)} />
        <PanelPengingat key={`pengingat-${periode.id}`} periodeId={periode.id} />
      </div>
    );
  } else {
    // Kelayakan hanya dibaca di tab pengaturan: satu query per pengajar aktif,
    // percuma dijalankan di tab yang tidak menampilkannya.
    const [kelayakan, daftarKelayakan] = await Promise.all([
      ringkasKelayakan(periode.id, sesi.gender),
      listKelayakan(periode.id),
    ]);
    isi = (
      <div className="ks-isi">
        <PanelImpor />
        <PeriodeBaru />
        <PanelSlot key={`slot-${periode.id}`} periodeId={periode.id} slots={slots} />
        <PanelPeriode
          key={`periode-${periode.id}`}
          periode={periode}
          superadmin={superadmin}
          polaHari={[...new Map(slotAktif.map((s) => [s.hari_idx.join(','), s.hari_idx])).values()].sort((a, b) => a.join().localeCompare(b.join()))}
        />
        <PanelKelayakan
          key={`kelayakan-${periode.id}`}
          periodeId={periode.id}
          baris={urutkanKelayakan(kelayakan).map((b) => ({
            pengajar_id: b.pengajar_id,
            nama: b.nama,
            boleh: b.boleh,
            belumDisetel: b.belumDisetel,
            belumMengajar: b.belumMengajar,
            punyaIsian: b.punyaIsian,
            isianOffline: b.isianOffline,
          }))}
          pakaiDaftar={daftarDipakai(daftarKelayakan)}
          periodeLain={semuaPeriode
            .filter((p) => p.id !== periode.id)
            .map((p) => ({ id: p.id, nama: p.nama }))}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-sm btn-ghost" href={`/api/ketersediaan/ekspor?periode=${periode.id}`}>
            Unduh xlsx periode ini
          </a>
          <a className="btn btn-sm btn-ghost" href="/ketersediaan/koordinator/tilawah">
            Pemetaan &amp; pengiriman CMS tilawah
          </a>
        </div>
      </div>
    );
  }

  return (
    <Bingkai>
      <Kop />
      <h1 className="t-h1" style={{ margin: '8px 0 2px' }}>Kelola Ketersediaan Mengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted)', margin: 0 }}>
        Masih tersembunyi — hanya terlihat oleh superadmin. Pengajar belum bisa membuka halamannya.
      </p>
      <KepalaDasbor
        periode={semuaPeriode}
        aktif={periode}
        tab={tab}
        g={g}
        hitungan={{
          jam: tanpaPengajar.length,
          pendaftar: angka.tertahan,
          usulan: tugasG.usulanMenunggu + tugasG.tenggatLewat + tugasG.sanggahan + tugasG.ditolak + tugasG.gagal,
        }}
      />
      {isi}
    </Bingkai>
  );
}

async function HalamanGabungan({
  tahap,
  semuaPeriode,
  tab,
  g,
  sekarang,
}: {
  tahap: KsPeriode[];
  semuaPeriode: KsPeriode[];
  tab: 'ringkasan' | 'jam';
  g: 'semua' | Gender;
  sekarang: Date;
}) {
  const hasil = await susunGabungan(tahap, sekarang);
  const aturan = [...tahap].sort((a, b) => a.mulai.localeCompare(b.mulai))[0];

  // Daya tampung per jam diambil dari simulasi alokasi, bukan perkiraan
  // pengajar × kapasitas: pengajar yang menyanggupi banyak jam hanya bisa
  // memegang sebagian, dan simulasi yang tahu mana.
  const jamSemua = terapkanSimulasi(
    susunBarisJam(hasil.slots, hasil.ringkas, aturan.kapasitas_halaqah),
    hasil.tampungSim,
    aturan.kapasitas_halaqah
  );
  const jam = g === 'semua' ? jamSemua : jamSemua.filter((b) => b.kelompok === g);

  const angkaUntuk = (baris: readonly BarisJam[], gender?: Gender) => ({
    ...jumlahkan(baris),
    tertahan: gender ? hasil.tertahan[gender] : hasil.tertahan.ikhwan + hasil.tertahan.akhwat,
    pengajar: gender ? hasil.pengajar[gender].total : hasil.pengajar.ikhwan.total + hasil.pengajar.akhwat.total,
  });
  const angka = angkaUntuk(jam, g === 'semua' ? undefined : g);
  const pecah =
    g === 'semua'
      ? {
          ikhwan: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'ikhwan'), 'ikhwan'),
          akhwat: angkaUntuk(jamSemua.filter((b) => b.kelompok === 'akhwat'), 'akhwat'),
        }
      : null;

  const href = (t: TabDasbor) => tautanDasbor({ periode: PERIODE_GABUNGAN, tab: t, g });
  const tanpaPengajar = jam.filter((b) => b.status === 'tanpa_pengajar');
  const kurang = jam.filter((b) => b.status === 'kurang');
  const butir: ButirTugas[] = [];
  if (tanpaPengajar.length > 0) {
    butir.push({
      nada: 'merah',
      judul: `${tanpaPengajar.length} jam tanpa pengajar di tahap mana pun`,
      desk: `${fmt(tanpaPengajar.reduce((a, b) => a + b.antre, 0))} pendaftar memilih jam itu.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }
  if (kurang.length > 0) {
    butir.push({
      nada: 'kuning',
      judul: `${kurang.length} jam kekurangan pengajar`,
      desk: `${fmt(kurang.reduce((a, b) => a + b.sisa, 0))} pendaftar tetap belum tertampung walau pengajar kedua tahap dipakai.`,
      href: href('jam'),
      label: 'Lihat jam',
    });
  }

  const genderTampil: Gender[] = g === 'semua' ? ['ikhwan', 'akhwat'] : [g];
  const kartuTahap = (
    <div className="ks-kartu">
      <div className="ks-kartu-kepala">
        <h2>Daya tampung gabungan</h2>
        <p>Simulasi alokasi dengan pengajar semua tahap — tidak menyimpan apa pun</p>
      </div>
      <div className="ks-kartu-isi">
        <div className="table-scroll">
          <table className="k-table" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th>Kelompok</th>
                <th>Menunggu</th>
                {hasil.periode.map((p) => (
                  <th key={p.id}>Pengajar {p.nama}</th>
                ))}
                <th>Pengajar gabungan</th>
                <th>Halaqah terbentuk</th>
                <th>Tertampung</th>
                <th>Belum</th>
              </tr>
            </thead>
            <tbody>
              {genderTampil.map((x) => {
                const sim = hasil.simulasi[x];
                const persen = sim.antre > 0 ? Math.round((sim.peserta / sim.antre) * 100) : 0;
                return (
                  <tr key={x}>
                    <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{x}</td>
                    <td>{fmt(sim.antre)}</td>
                    {hasil.pengajar[x].perTahap.map((t) => (
                      <td key={t.periode}>{fmt(t.n)}</td>
                    ))}
                    <td>{fmt(hasil.pengajar[x].total)}</td>
                    <td>
                      {fmt(sim.halaqah)}
                      <div className="sub">{fmt(sim.pengajarDapat)} pengajar kebagian</div>
                    </td>
                    <td>
                      {fmt(sim.peserta)}
                      <div className="sub">{persen}% dari yang menunggu</div>
                    </td>
                    <td>{fmt(Math.max(0, sim.antre - sim.peserta))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="t-small" style={{ color: 'var(--ink-2)', margin: '10px 0 0' }}>
          Pendaftar di CSV beberapa tahap dihitung sekali. Pengajar yang bersedia di jam yang sama pada dua tahap
          dihitung sekali, karena kedua tahap berjalan bersamaan. Halaqah hanya terbentuk dari kelompok penuh (
          {aturan.kapasitas_halaqah} orang per level dan kelompok umur); sisa yang belum genap menunggu pendaftar
          berikutnya.
        </p>
      </div>
    </div>
  );

  return (
    <Bingkai>
      <Kop />
      <h1 className="t-h1" style={{ margin: '8px 0 2px' }}>Kelola Ketersediaan Mengajar</h1>
      <p className="t-small" style={{ color: 'var(--muted)', margin: 0 }}>
        Gabungan {hasil.periode.map((p) => p.nama).join(' + ')}. Untuk membentuk halaqah, buka tahapnya masing-masing.
      </p>
      <KepalaDasbor
        periode={semuaPeriode}
        aktif={aturan}
        gabungan
        tab={tab}
        g={g}
        hitungan={{ jam: tanpaPengajar.length }}
      />
      {tab === 'ringkasan' ? (
        <TabRingkasan
          angka={angka}
          pecah={pecah}
          tugas={butir}
          teratas={jam.filter((b) => b.sisa > 0).slice(0, 5)}
          peta={petaPerGender(jam, g)}
          hrefJam={href('jam')}
          tampilGender={g === 'semua'}
          catatan={
            <>
              Sudah masuk usulan di tahap mana pun: <b>{fmt(angka.dialokasikan)}</b> · ditahan saringan:{' '}
              <b>{fmt(angka.tertahan)}</b> · pendaftar yang sama di beberapa tahap dihitung sekali
            </>
          }
          ketTampung="Hasil simulasi alokasi dengan pengajar semua tahap. Pengajar yang menyanggupi banyak jam tidak dihitung berulang."
          sisipan={kartuTahap}
        />
      ) : (
        <TabJam baris={jam} tampilGender={g === 'semua'} />
      )}
    </Bingkai>
  );
}

function Kop() {
  return (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark">H</span> Ketersediaan Mengajar
      </div>
      <LogoutButton />
    </div>
  );
}

function Bingkai({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
