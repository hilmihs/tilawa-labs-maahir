import { requirePengajar } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { LogoutButton } from '@/components/LogoutButton';
import Link from 'next/link';
import { formTerbuka, getPeriodeAktif, listSlot, periodeTerbukaUntukPengajar } from '@/lib/ketersediaan-periode';
import {
  alasanTerkunci,
  jadwalTerpakaiPengajar,
  kunciSlot,
} from '@/lib/ketersediaan-bentrok';
import { ringkasSlot, teksPeluang } from '@/lib/ketersediaan-permintaan';
import { apakahLayak } from '@/lib/ketersediaan-kelayakan';
import { FormKetersediaan, type SlotTampil } from './FormKetersediaan';
import { unstable_cache } from 'next/cache';
import { susunGabungan } from '@/lib/ketersediaan-gabungan';
import type { KsPeriode } from '@/types/db';

/**
 * Halaqah yang dibutuhkan per slot: kelompok pendaftar yang sudah genap tetapi
 * belum kebagian pengajar, menurut simulasi mesin alokasi pada tanggal mulai KBM
 * (sisa kelompok umur sudah boleh digabung). Definisi yang sama dengan dashboard
 * koordinator dan deck pertemuan pengajar.
 *
 * Simulasinya mahal (cek bentrok semua pengajar), sedangkan halaman ini dibuka
 * banyak pengajar — hasil disimpan 10 menit per periode.
 */
function butuhHalaqahPerSlot(periode: KsPeriode): Promise<Record<string, number>> {
  return unstable_cache(
    async () => {
      const acuan = new Date(Math.max(Date.now(), Date.parse(`${periode.mulai}T00:00:00Z`)));
      const hasil = await susunGabungan([periode], acuan);
      return Object.fromEntries(hasil.butuhHalaqah);
    },
    ['ks-butuh-halaqah', periode.id, periode.mulai],
    { revalidate: 600 }
  )();
}

export const dynamic = 'force-dynamic';

const tanggalPendek = (t: string) =>
  new Date(`${t.slice(0, 10)}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export default async function KetersediaanPengajarPage({
  searchParams,
}: {
  searchParams?: { periode?: string };
}) {
  const sesi = await requirePengajar();

  const sekarang = new Date();
  // Beberapa tahap bisa terbuka bersamaan (mis. mulai 5 dan 21 Oktober). Pengajar
  // memilih; bawaannya tahap yang KBM-nya paling dekat. Bila tak satu pun
  // terbuka, periode aktif terbaru tetap ditampilkan dalam keadaan tertutup.
  const terbukaSemua = await periodeTerbukaUntukPengajar(sekarang);
  const periode =
    terbukaSemua.find((p) => p.id === searchParams?.periode) ?? terbukaSemua[0] ?? (await getPeriodeAktif());

  const kop = (
    <div className="topbar">
      <div className="wordmark">
        <span className="mark">H</span> Ketersediaan Mengajar
      </div>
      <LogoutButton />
    </div>
  );

  if (!periode) {
    return (
      <Bingkai>
        {kop}
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Ketersediaan Mengajar HITS</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Belum ada periode penarikan yang dibuka. Koordinator akan mengumumkan bila sudah siap.
        </p>
      </Bingkai>
    );
  }

  // Daftar pengajar satu batch ditentukan koordinator; akun ber-role `pengajar`
  // yang tidak masuk daftar tidak boleh mengisi (lihat ketersediaan-kelayakan.ts).
  if (!(await apakahLayak(periode.id, sesi.pengajar_id))) {
    return (
      <Bingkai>
        {kop}
        <h1 className="t-h1" style={{ marginBottom: 4 }}>Ketersediaan Mengajar HITS</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Anda belum terdaftar sebagai pengajar untuk periode <strong>{periode.nama}</strong>,
          jadi pengisian ketersediaan belum terbuka. Bila seharusnya ikut, silakan hubungi
          koordinator untuk dimasukkan ke daftar.
        </p>
      </Bingkai>
    );
  }

  const terbuka = formTerbuka(periode, sekarang);
  const semuaSlot = await listSlot(periode.id, { hanyaAktif: true });
  const slot = semuaSlot.filter((s) => s.kelompok === sesi.gender);

  const [terpakai, ringkas, butuh] = await Promise.all([
    jadwalTerpakaiPengajar(sesi.pengajar_id, { acuan: periode.mulai }),
    ringkasSlot(periode, slot, sekarang),
    butuhHalaqahPerSlot(periode),
  ]);
  const terkunci = kunciSlot(slot, terpakai);

  const { data: pengisian } = await supabaseAdmin
    .from('ks_pengisian')
    .select('id, mode, lokasi, komitmen, terkunci, submitted_at, sumber')
    .eq('periode_id', periode.id)
    .eq('pengajar_id', sesi.pengajar_id)
    .maybeSingle();

  let dipilih: string[] = [];
  const sanggahan = new Map<string, string>();
  // Beda dari `dipilih`: ini keberadaan barisnya apa adanya, termasuk baris yang
  // hanya berisi sanggahan menunggu. Dipakai agar pilihan lama tetap bisa
  // dilepas walau slotnya sekarang dianggap bentrok.
  const tersimpan = new Set<string>();
  if (pengisian) {
    const { data: baris } = await supabaseAdmin
      .from('ks_ketersediaan')
      .select('slot_id, status, sanggahan_status')
      .eq('pengisian_id', pengisian.id);
    for (const b of (baris ?? []) as {
      slot_id: string;
      status: string;
      sanggahan_status: string | null;
    }[]) {
      if (b.sanggahan_status) sanggahan.set(b.slot_id, b.sanggahan_status);
      tersimpan.add(b.slot_id);
      // Baris yang hanya berisi sanggahan bukan pilihan — jangan dicentang.
      if (b.sanggahan_status === 'menunggu' && b.status === 'perlu_konfirmasi') continue;
      dipilih.push(b.slot_id);
    }
  }
  dipilih = [...new Set(dipilih)];

  const daftar: SlotTampil[] = slot.map((s) => {
    const r = ringkas.get(s.id);
    const kunci = terkunci.get(s.id);
    const statusSanggahan = sanggahan.get(s.id) ?? null;
    // Sanggahan yang sudah diterima membuka kunci — koordinator sudah menyatakan
    // jadwal lama itu memang sudah selesai.
    const terkunciFinal = Boolean(kunci) && statusSanggahan !== 'diterima';
    return {
      id: s.id,
      label: s.label,
      mode: s.mode,
      lokasi: s.lokasi,
      terkunci: terkunciFinal,
      alasan_kunci: kunci ? alasanTerkunci(kunci) : null,
      sanggahan_status: statusSanggahan,
      antre: r?.antre ?? 0,
      butuh_halaqah: butuh[s.id] ?? 0,
      // "Butuh pengajar" = ada kelompok genap yang belum kebagian pengajar.
      butuh_pengajar: (butuh[s.id] ?? 0) > 0,
      pengajar_tersedia: r?.pengajar_tersedia ?? 0,
      peluang: teksPeluang(r?.riwayat ?? null),
      tersimpan: tersimpan.has(s.id),
      // Penambahan slot offline kini lewat koordinator, jadi slot offline tidak
      // boleh dicentang baru walau tidak bentrok. Yang sudah tersimpan tetap
      // bisa dilepas — itu diurus di sisi form.
      boleh_tambah: !terkunciFinal && s.mode !== 'offline',
    };
  });

  // Usulan yang belum disetujui koordinator tetap mengunci jam, tetapi belum
  // diumumkan ke pengajar — jangan tampil sebagai "halaqah yang Anda pegang".
  const jadwalSaya = terpakai.filter((t) => t.sumber !== 'usulan' || t.status_usulan === 'dikonfirmasi' || t.status_usulan === 'dikirim').map((t) => ({
    nama: t.nama,
    batch: t.batch,
    label: t.label,
    sumber: t.sumber,
    level: t.level ?? null,
    selesai: t.selesai,
  })).filter((j, i, semua) => semua.findIndex((x) => x.nama === j.nama && x.label === j.label) === i);

  return (
    <Bingkai>
      {kop}

      <h1 className="t-h1" style={{ marginBottom: 4 }}>Ketersediaan Mengajar HITS</h1>
      {terbukaSemua.length > 1 && (
        <nav aria-label="Pilih periode" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px' }}>
          {terbukaSemua.map((p) => (
            <Link
              key={p.id}
              href={`/ketersediaan/pengajar?periode=${p.id}`}
              className={p.id === periode.id ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
              aria-current={p.id === periode.id ? 'page' : undefined}
            >
              {p.nama} · mulai {tanggalPendek(p.mulai)}
            </Link>
          ))}
        </nav>
      )}
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        Periode <strong>{periode.nama}</strong>. Nyatakan slot waktu yang Anda sanggupi —
        bukan tanggal. Kelas dibentuk saat murid cukup dan pengajar tersedia.
        Slot offline diatur koordinator, jadi tidak bisa ditambahkan sendiri dari halaman ini.
      </p>

      {jadwalSaya.length > 0 && (
        <section
          style={{
            border: '1px solid var(--line)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <h2 className="t-h2" style={{ marginBottom: 6, fontSize: 15 }}>
            Halaqah yang Anda pegang sekarang
          </h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {jadwalSaya.map((j, i) => (
              <li key={i} className="t-small" style={{ marginBottom: 2 }}>
                <strong>{j.nama}</strong>
                {j.batch ? ` · ${j.batch}` : ''} — {j.label || 'jadwal tidak tercatat'}
                {j.sumber === 'maahir' ? ' (kelas Maahir)' : ''}
                {j.sumber === 'usulan' ? ` (halaqah baru${j.level ? `, ${j.level}` : ''})` : ''}
                {j.selesai ? ` · jam ini terpakai s.d. ${tanggalPendek(j.selesai)}` : ''}
              </li>
            ))}
          </ul>
          <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 8, marginBottom: 0 }}>
            Slot pada jam yang sama dengan daftar di atas tampil terkunci di bawah — hanya untuk periode yang mulai
            sebelum halaqah itu selesai. HITS Dasar memakai jam lebih lama (50 pertemuan) daripada HITS Lanjutan (26).
          </p>
        </section>
      )}

      <FormKetersediaan
        key={periode.id}
        periodeId={periode.id}
        slots={daftar}
        awalDipilih={dipilih}
        awalMode={(pengisian?.mode as 'online' | 'offline' | 'keduanya') ?? 'online'}
        awalLokasi={(pengisian?.lokasi as string | null) ?? ''}
        sudahKirim={Boolean(pengisian?.submitted_at)}
        // Baris hasil impor membawa komitmen=true padahal pengajarnya belum
        // pernah melihat form ini; mencentangnya otomatis = komitmen palsu.
        komitmenAwal={Boolean(pengisian?.komitmen) && pengisian?.sumber === 'form'}
        terkunciIsian={Boolean(pengisian?.terkunci)}
        kapasitas={periode.kapasitas_halaqah}
        formTerbuka={terbuka}
      />
    </Bingkai>
  );
}

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 20 }}>{children}</div>
      </div>
    </main>
  );
}
