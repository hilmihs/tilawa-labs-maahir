import { supabaseAdmin } from '@/lib/supabase-admin';
import { absUrl } from '@/lib/url';
import { buildWaMeUrl, tplUndanganPeserta } from '@/lib/whatsapp';
import { aksesTokenBerakhir, MASA_AKSES_SETELAH_MULAI_HARI } from '@/lib/ketersediaan-konfirmasi';
import type { Gender } from '@/types/db';
import { PanelKonfirmasi, type PesertaTampil } from './PanelKonfirmasi';

export const dynamic = 'force-dynamic';

/**
 * Halaman konfirmasi pengajar. Terbuka tanpa login — yang menjaga adalah token
 * pada URL, pola yang sama dengan /tabayyun/[token] dan /hits/pindah-halaqah/[token].
 *
 * Identitas peserta hanya ditampilkan SETELAH pengajar menyatakan bersedia.
 * Sebelum itu ia hanya melihat jumlahnya — tidak ada alasan membuka data calon
 * murid kepada orang yang mungkin menolak.
 */
export default async function KonfirmasiPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const { data } = await supabaseAdmin
    .from('ks_usulan')
    .select(
      'id, status, level, pita_umur, pita_digabung, tanggal_mulai, dikonfirmasi_pada, token_kedaluwarsa, nama_halaqah, grup_wa_link, alasan_tolak, slot:slot_id(label, mode, lokasi, kelompok), pengajar:pengajar_id(name, gender), periode:periode_id(nama)'
    )
    .eq('akses_token', token)
    .maybeSingle();

  if (!data) {
    return (
      <Bingkai>
        <h1 className="t-h1">Tautan tidak dikenali</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tautan konfirmasi ini sudah tidak berlaku atau salah salin. Hubungi koordinator HITS.
        </p>
      </Bingkai>
    );
  }

  // Tautan yang sudah lama dikonfirmasi berhenti membuka data peserta: tautan
  // bisa diteruskan, dan pemegangnya tidak perlu lagi melihat nama & nomor murid.
  if (
    aksesTokenBerakhir(
      {
        status: data.status as string,
        tanggal_mulai: (data.tanggal_mulai as string | null) ?? null,
        dikonfirmasi_pada: (data.dikonfirmasi_pada as string | null) ?? null,
      },
      new Date()
    )
  ) {
    return (
      <Bingkai>
        <h1 className="t-h1">Masa berlaku tautan sudah habis</h1>
        <p className="t-small" style={{ color: 'var(--muted-2)' }}>
          Tautan konfirmasi hanya berlaku sampai {MASA_AKSES_SETELAH_MULAI_HARI} hari setelah halaqah
          dimulai. Untuk data peserta atau penggantian grup, hubungi koordinator HITS.
        </p>
      </Bingkai>
    );
  }

  const slot = data.slot as { label: string; mode: string; lokasi: string | null; kelompok: Gender } | null;
  const pengajar = data.pengajar as { name: string; gender: Gender } | null;
  const periode = data.periode as { nama: string } | null;

  const { data: pesertaRows } = await supabaseAdmin
    .from('ks_usulan_peserta')
    .select('id, status, undangan_token, pendaftar:pendaftar_id(nama, wa_normal, umur, pita_umur)')
    .eq('usulan_id', data.id);

  // `gagal` = pengiriman ke CMS bermasalah; bagi pengajar halaqahnya tetap jalan.
  const sudahSetuju = ['dikonfirmasi', 'dikirim', 'gagal'].includes(data.status as string);
  const namaHalaqah = (data.nama_halaqah as string | null) ?? 'Halaqah HITS baru';

  const peserta: PesertaTampil[] = sudahSetuju
    ? ((pesertaRows ?? []) as {
        id: string;
        status: string;
        undangan_token: string | null;
        pendaftar?: { nama: string; wa_normal: string | null; umur: number | null; pita_umur: string | null } | null;
      }[]).map((p) => {
        const nama = p.pendaftar?.nama ?? '—';
        const undanganUrl = p.undangan_token ? absUrl(`/ketersediaan/undangan/${p.undangan_token}`) : null;
        const teks =
          undanganUrl && pengajar && slot
            ? tplUndanganPeserta({
                namaPeserta: nama,
                namaHalaqah,
                slotLabel: slot.label,
                pengajarName: pengajar.name,
                tanggalMulai: (data.tanggal_mulai as string | null) ?? '—',
                undanganUrl,
              })
            : null;
        return {
          id: p.id,
          nama,
          umur: p.pendaftar?.umur ?? null,
          status: p.status,
          waUrl: p.pendaftar?.wa_normal && teks ? buildWaMeUrl(p.pendaftar.wa_normal, teks) : null,
        };
      })
    : [];

  return (
    <Bingkai>
      <h1 className="t-h1" style={{ marginBottom: 4 }}>Konfirmasi Halaqah</h1>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 16 }}>
        {periode?.nama ?? 'Periode HITS'}
        {pengajar ? ` · untuk ${pengajar.name}` : ''}
      </p>

      <div className="card-flat" style={{ padding: '12px 14px', marginBottom: 16 }}>
        <Baris label="Jadwal" nilai={slot?.label ?? '—'} />
        <Baris label="Mode" nilai={slot?.mode === 'offline' ? `Offline — ${slot.lokasi ?? 'lokasi belum ditetapkan'}` : 'Online'} />
        <Baris label="Level" nilai={data.level as string} />
        <Baris
          label="Peserta"
          nilai={`${(pesertaRows ?? []).length} murid${
            data.pita_digabung ? ' (pita umur digabung karena antrean sudah lama)' : data.pita_umur ? ` · umur ${data.pita_umur}` : ''
          }`}
        />
        <Baris label="Mulai mengajar" nilai={(data.tanggal_mulai as string | null) ?? 'belum ditetapkan'} />
        {data.token_kedaluwarsa && data.status === 'menunggu' && (
          <Baris
            label="Batas konfirmasi"
            nilai={new Date(data.token_kedaluwarsa as string).toLocaleString('id-ID', {
              timeZone: 'Asia/Jakarta',
            })}
          />
        )}
      </div>

      <PanelKonfirmasi
        token={token}
        status={data.status as string}
        alasanTolak={(data.alasan_tolak as string | null) ?? null}
        namaHalaqah={namaHalaqah}
        slotLabel={slot?.label ?? ''}
        grupLink={(data.grup_wa_link as string | null) ?? null}
        peserta={peserta}
      />
    </Bingkai>
  );
}

function Baris({ label, nilai }: { label: string; nilai: string }) {
  return (
    <p className="t-small" style={{ margin: '2px 0' }}>
      <span style={{ color: 'var(--muted-2)', display: 'inline-block', minWidth: 130 }}>{label}</span>
      <strong>{nilai}</strong>
    </p>
  );
}

function Bingkai({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="page" style={{ paddingTop: 24 }}>
          <div className="wordmark" style={{ marginBottom: 16 }}>
            <span className="mark">H</span> Tilawa Labs · HITS
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
