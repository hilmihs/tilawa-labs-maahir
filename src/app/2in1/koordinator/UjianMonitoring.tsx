import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  LegendaPredikat,
  PredikatTrio,
  StatusPeriodeBadge,
  StatusUjianBadge,
} from '@/components/ujian/UjianBadges';
import { muatPeriodeTerpilih, muatUjianPeserta } from '@/lib/ujian-data';
import {
  formatRentang,
  perkiraanBerikutnya,
  statusPeriode,
  statusUjianPeserta,
  type StatusUjianPeserta,
} from '@/lib/ujian';
import type { Gender } from '@/types/db';
import { JadwalUjianForm } from './JadwalUjianForm';
import { UjianKelasSelect } from './UjianKelasSelect';

type PesertaRow = { id: string; name: string; gender: Gender; kelas_id: string };
type KelasInfo = { name: string; musyrifName: string | null };

const STATUS_FILTER: Array<{ v: StatusUjianPeserta | ''; l: string }> = [
  { v: '', l: 'Semua' },
  { v: 'belum', l: 'Belum ujian' },
  { v: 'menunggu', l: 'Menunggu dinilai' },
  { v: 'dinilai', l: 'Sudah dinilai' },
];

const GENDER_FILTER: Array<{ v: Gender | ''; l: string }> = [
  { v: '', l: 'Semua' },
  { v: 'ikhwan', l: 'Ikhwan' },
  { v: 'akhwat', l: 'Akhwat' },
];

/**
 * Bagian "Ujian" di dashboard koordinator. Memakai daftar peserta yang sudah
 * tersaring filter gender/kelas/cari di halaman, lalu disaring lagi oleh filter
 * milik bagian ini sendiri (`ujian_gender`, `ujian_kelas`, `ujian_status`).
 * Opsi gender/kelas hanya yang ada di data, jadi bila daftar halaman sudah
 * tinggal satu gender, gender lain tidak ditawarkan.
 */
export async function UjianMonitoring({
  pesertaList,
  kelasById,
  periodeParam,
  statusParam,
  genderParam,
  kelasParam,
  query,
}: {
  pesertaList: PesertaRow[];
  kelasById: Map<string, KelasInfo>;
  periodeParam: string | undefined;
  statusParam: string | undefined;
  genderParam: string | undefined;
  kelasParam: string | undefined;
  query: Record<string, string | undefined>;
}) {
  const { semua, periode, today } = await muatPeriodeTerpilih(periodeParam);

  // Filter gender → kelas → status. Kelas yang ditawarkan mengikuti gender terpilih.
  const genderAda = new Set(pesertaList.map((p) => p.gender));
  const opsiGender = GENDER_FILTER.filter((f) => !f.v || genderAda.has(f.v));
  const filterGender = opsiGender.some((f) => f.v && f.v === genderParam) ? (genderParam as Gender) : null;
  const pesertaGender = filterGender ? pesertaList.filter((p) => p.gender === filterGender) : pesertaList;
  const kelasGender = new Map<string, Gender>();
  for (const p of pesertaGender) if (!kelasGender.has(p.kelas_id)) kelasGender.set(p.kelas_id, p.gender);
  const tampilGender = !filterGender && genderAda.size > 1;
  const opsiKelas = Array.from(kelasGender, ([id, g]) => {
    const nama = kelasById.get(id)?.name ?? '—';
    return { id, label: tampilGender ? `${nama} · ${g === 'ikhwan' ? 'Ikhwan' : 'Akhwat'}` : nama };
  }).sort((a, b) => a.label.localeCompare(b.label, 'id'));
  const filterKelas = kelasParam && kelasGender.has(kelasParam) ? kelasParam : null;
  const pesertaTersaring = filterKelas ? pesertaGender.filter((p) => p.kelas_id === filterKelas) : pesertaGender;
  const filterStatus = STATUS_FILTER.some((f) => f.v && f.v === statusParam) ? (statusParam as StatusUjianPeserta) : null;

  // Link mempertahankan param halaman + filter ujian yang sedang aktif.
  const tetap: Record<string, string | null | undefined> = {
    ...query,
    ujian_gender: filterGender,
    ujian_kelas: filterKelas,
    ujian_status: filterStatus,
  };
  const href = (ubah: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...tetap, ...ubah })) if (v) sp.set(k, v);
    const s = sp.toString();
    return `/2in1/koordinator${s ? `?${s}` : ''}#ujian`;
  };

  const { data: pakaiRaw } = await supabaseAdmin.from('ujian').select('periode_id');
  const jumlahPer = new Map<string, number>();
  for (const r of pakaiRaw ?? []) jumlahPer.set(r.periode_id as string, (jumlahPer.get(r.periode_id as string) ?? 0) + 1);

  const terakhir = semua[semua.length - 1] ?? null;
  const usulanTgl = terakhir ? perkiraanBerikutnya(terakhir) : null;
  const usulan = usulanTgl
    ? {
        nama: `Ujian ${new Date(`${usulanTgl.mulai}T00:00:00Z`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`,
        ...usulanTgl,
      }
    : null;

  const jadwal = (
    <details className="card-flat" style={{ padding: '12px 16px', marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
        Atur jadwal ujian ({semua.length} periode · ±3 bulan sekali)
      </summary>
      <div style={{ marginTop: 12 }}>
        <JadwalUjianForm
          periodes={semua.map((p) => ({ id: p.id, nama: p.nama, mulai: p.mulai, selesai: p.selesai, jumlahData: jumlahPer.get(p.id) ?? 0 }))}
          usulan={usulan}
        />
      </div>
    </details>
  );

  if (!periode) {
    return (
      <section id="ujian" style={{ marginTop: 24 }}>
        <h2 className="t-h1" style={{ fontSize: 20, marginBottom: 4 }}>Ujian hafalan</h2>
        <p className="t-small">Belum ada jadwal ujian.</p>
        {jadwal}
      </section>
    );
  }

  const stPeriode = statusPeriode(periode, today);
  const map = await muatUjianPeserta(periode.id, pesertaTersaring.map((p) => p.id));
  const semuaRows = pesertaTersaring.map((p) => {
    const d = map.get(p.id);
    return { peserta: p, ujian: d?.ujian ?? null, rekaman: d?.rekaman ?? [], status: statusUjianPeserta(d?.ujian) };
  });
  const hitung = {
    belum: semuaRows.filter((r) => r.status === 'belum').length,
    menunggu: semuaRows.filter((r) => r.status === 'menunggu').length,
    dinilai: semuaRows.filter((r) => r.status === 'dinilai').length,
  };
  const rows = filterStatus ? semuaRows.filter((r) => r.status === filterStatus) : semuaRows;

  const berikutnya = semua.find((p) => p.mulai > periode.selesai) ?? null;
  const perkiraan = berikutnya ? null : perkiraanBerikutnya(periode);

  return (
    <section id="ujian" style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="t-h1" style={{ fontSize: 20, marginBottom: 4 }}>
            Ujian hafalan — {periode.nama}
          </h2>
          <p className="t-small" style={{ margin: 0 }}>
            Tanggal ujian {formatRentang(periode.mulai, periode.selesai)} · berikutnya{' '}
            {berikutnya
              ? formatRentang(berikutnya.mulai, berikutnya.selesai)
              : perkiraan
                ? `perkiraan ${formatRentang(perkiraan.mulai, perkiraan.selesai)}`
                : '—'}
          </p>
        </div>
        <StatusPeriodeBadge status={stPeriode} />
      </div>

      {semua.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {[...semua].reverse().map((p) => (
            <Link
              key={p.id}
              href={href({ ujian: p.id, ujian_status: null })}
              className={`btn btn-xs ${p.id === periode.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{ textDecoration: 'none' }}
            >
              {p.nama}
            </Link>
          ))}
        </div>
      )}

      {(opsiGender.length > 2 || opsiKelas.length > 1) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
          {opsiGender.length > 2 &&
            opsiGender.map((f) => (
              <Link
                key={f.v || 'semua'}
                href={href({ ujian: periode.id, ujian_gender: f.v || null, ujian_kelas: null })}
                className={`btn btn-xs ${(filterGender ?? '') === f.v ? 'btn-primary' : 'btn-ghost'}`}
                style={{ textDecoration: 'none' }}
              >
                {f.l}
              </Link>
            ))}
          {opsiKelas.length > 1 && (
            <UjianKelasSelect
              value={filterKelas ?? ''}
              options={[
                { value: '', label: 'Semua kelas', href: href({ ujian: periode.id, ujian_kelas: null }) },
                ...opsiKelas.map((k) => ({ value: k.id, label: k.label, href: href({ ujian: periode.id, ujian_kelas: k.id }) })),
              ]}
            />
          )}
        </div>
      )}

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="v">{semuaRows.length}</div>
          <div className="l">Total peserta</div>
        </div>
        <div className="stat">
          <div className="v" style={{ color: 'var(--merah-ink)' }}>{hitung.belum}</div>
          <div className="l">
            <span className="accent-dot" style={{ background: 'var(--merah)' }} />
            Belum ujian
          </div>
        </div>
        <div className="stat">
          <div className="v" style={{ color: 'var(--kuning-ink)' }}>{hitung.menunggu}</div>
          <div className="l">
            <span className="accent-dot" style={{ background: 'var(--kuning)' }} />
            Menunggu dinilai
          </div>
        </div>
        <div className="stat">
          <div className="v" style={{ color: 'var(--hijau-ink)' }}>{hitung.dinilai}</div>
          <div className="l">
            <span className="accent-dot" style={{ background: 'var(--hijau)' }} />
            Sudah dinilai
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '12px 0 8px' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUS_FILTER.map((f) => (
            <Link
              key={f.v || 'semua'}
              href={href({ ujian: periode.id, ujian_status: f.v || null })}
              className={`btn btn-xs ${(filterStatus ?? '') === f.v ? 'btn-primary' : 'btn-ghost'}`}
              style={{ textDecoration: 'none' }}
            >
              {f.l} ({f.v ? hitung[f.v] : semuaRows.length})
            </Link>
          ))}
        </div>
        <LegendaPredikat />
      </div>

      <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-scroll">
          <table className="k-table">
            <thead>
              <tr>
                <th>Peserta</th>
                <th>Kelas · Musyrif/ah</th>
                <th>Status</th>
                <th>Nilai</th>
                <th>Tanggal</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="t-small">Tidak ada peserta.</td>
                </tr>
              ) : (
                rows.map(({ peserta, ujian, rekaman, status }) => {
                  const k = kelasById.get(peserta.kelas_id);
                  return (
                    <tr key={peserta.id}>
                      <td>
                        <div className="nm">{peserta.name}</div>
                        <div className="sub">{peserta.gender}</div>
                      </td>
                      <td>
                        <div>{k?.name ?? '—'}</div>
                        <div className="sub">{k?.musyrifName ?? '—'}</div>
                      </td>
                      <td><StatusUjianBadge status={status} /></td>
                      <td>{status === 'dinilai' ? <PredikatTrio rekaman={rekaman} /> : <span className="t-small">—</span>}</td>
                      <td>
                        {ujian?.submitted_at || ujian?.checked_at ? (
                          <>
                            <div className="sub">{ujian.submitted_at ? `kirim ${tgl(ujian.submitted_at)}` : 'ujian langsung'}</div>
                            {ujian.checked_at && <div className="sub">dinilai {tgl(ujian.checked_at)}</div>}
                          </>
                        ) : (
                          <span className="t-small">—</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        {status === 'belum' ? (
                          ujian?.alasan_belum ? (
                            <span style={{ fontSize: 12 }}>{ujian.alasan_belum}</span>
                          ) : (
                            <span className="t-small" style={{ color: 'var(--muted-2)' }}>belum ada keterangan</span>
                          )
                        ) : (
                          <span className="t-small">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="t-small" style={{ marginTop: 6 }}>
        Menampilkan {rows.length} dari {semuaRows.length} peserta (mengikuti filter gender/kelas di bagian ini dan filter/cari di atas)
      </div>

      {jadwal}
    </section>
  );
}

function tgl(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric' });
}
