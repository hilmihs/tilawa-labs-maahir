'use client';

import { useMemo, useState, useTransition } from 'react';
import { sanggahBentrok, simpanKetersediaan } from './actions';

export interface SlotTampil {
  id: string;
  label: string;
  mode: 'online' | 'offline';
  lokasi: string | null;
  terkunci: boolean;
  alasan_kunci: string | null;
  sanggahan_status: string | null;
  antre: number;
  /** Kelompok yang sudah genap tetapi belum ada pengajarnya. */
  butuh_halaqah: number;
  butuh_pengajar: boolean;
  pengajar_tersedia: number;
  peluang: string | null;
  // Slot ini sudah tercatat di ks_ketersediaan milik pengajar — termasuk baris
  // hasil impor. Dipakai agar pilihan lama tetap bisa dilepas walau slotnya
  // sekarang dianggap bentrok.
  tersimpan: boolean;
  // Slot ini boleh DICENTANG BARU. False bila terkunci karena bentrok (kecuali
  // sanggahannya diterima) atau bila slotnya offline — penambahan offline kini
  // hanya lewat koordinator.
  boleh_tambah: boolean;
}

interface Props {
  periodeId: string;
  slots: SlotTampil[];
  awalDipilih: string[];
  awalMode: 'online' | 'offline' | 'keduanya';
  awalLokasi: string;
  sudahKirim: boolean;
  // Terpisah dari `sudahKirim`: baris hasil impor punya komitmen tercatat padahal
  // pengajarnya belum pernah membuka form ini. Mencentangnya otomatis =
  // komitmen palsu, jadi centang awal hanya untuk isian yang benar-benar dari form.
  komitmenAwal: boolean;
  terkunciIsian: boolean;
  kapasitas: number;
  formTerbuka: boolean;
}

export function FormKetersediaan(props: Props) {
  const [dipilih, setDipilih] = useState<Set<string>>(new Set(props.awalDipilih));
  const [mode, setMode] = useState(props.awalMode);
  const [lokasi, setLokasi] = useState(props.awalLokasi);
  const [komitmen, setKomitmen] = useState(props.komitmenAwal);
  const [pesan, setPesan] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pending, mulai] = useTransition();

  const bisaDiubah = props.formTerbuka && !props.terkunciIsian;

  // Slot yang perlu pengajar didahulukan: itu yang mengarahkan pasokan ke tempat
  // yang kekurangan, bukan menambah rebutan di slot yang sudah ramai pengajar.
  const urut = useMemo(() => {
    return [...props.slots].sort((a, b) => {
      if (a.butuh_pengajar !== b.butuh_pengajar) return a.butuh_pengajar ? -1 : 1;
      if (a.terkunci !== b.terkunci) return a.terkunci ? 1 : -1;
      if (b.butuh_halaqah !== a.butuh_halaqah) return b.butuh_halaqah - a.butuh_halaqah;
      if (b.antre !== a.antre) return b.antre - a.antre;
      return a.label.localeCompare(b.label);
    });
  }, [props.slots]);

  const jumlah = dipilih.size;

  function alih(id: string) {
    setDipilih((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function kirim() {
    setGalat(null);
    setPesan(null);
    mulai(async () => {
      const r = await simpanKetersediaan({
        periodeId: props.periodeId,
        slotIds: [...dipilih],
        mode,
        lokasi,
        komitmen,
      });
      if (r.ok) setPesan(r.pesan);
      else setGalat(r.error);
    });
  }

  return (
    <div>
      {!props.formTerbuka && (
        <Kotak nada="netral">
          Periode pengisian sedang tertutup. Anda masih dapat melihat daftar slot, tetapi
          perubahan harus lewat koordinator.
        </Kotak>
      )}
      {props.terkunciIsian && props.formTerbuka && (
        <Kotak nada="netral">
          Isian Anda sudah dikunci karena data periode ini telah dirilis. Hubungi koordinator
          untuk perubahan — setiap perubahan setelah rilis dicatat.
        </Kotak>
      )}

      <h2 className="t-h2" style={{ marginBottom: 4, fontSize: 16 }}>Pilih slot waktu</h2>
      <p className="t-small" style={{ color: 'var(--muted-2)', marginBottom: 10 }}>
        Pilih sebanyak yang benar-benar Anda sanggupi — tidak ada jumlah minimum.
        Satu halaqah berisi maksimal {props.kapasitas} murid.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {urut.map((s) => (
          <KartuSlot
            key={s.id}
            periodeId={props.periodeId}
            slot={s}
            dicentang={dipilih.has(s.id)}
            bisaDiubah={bisaDiubah}
            onAlih={() => alih(s.id)}
          />
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label className="t-small" style={{ fontWeight: 600 }}>Mode mengajar</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {(['online', 'offline', 'keduanya'] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!bisaDiubah}
                onClick={() => setMode(m)}
                className={mode === m ? 'btn btn-sm' : 'btn btn-sm btn-ghost'}
                style={mode === m ? { background: 'var(--primary)', color: '#fff' } : undefined}
              >
                {m === 'online' ? 'Online' : m === 'offline' ? 'Offline' : 'Keduanya'}
              </button>
            ))}
          </div>
        </div>

        {mode !== 'online' && (
          <div>
            <label className="t-small" style={{ fontWeight: 600 }}>Lokasi mengajar offline</label>
            <input
              className="input"
              value={lokasi}
              disabled={!bisaDiubah}
              onChange={(e) => setLokasi(e.target.value)}
              placeholder="Masjid / lembaga tempat Anda mengajar"
              style={{ width: '100%', marginTop: 4 }}
            />
          </div>
        )}

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={komitmen}
            disabled={!bisaDiubah}
            onChange={(e) => setKomitmen(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span className="t-small">
            Saya menyatakan bersedia mengajar pada slot yang saya pilih, dan akan memberi tahu
            koordinator bila berhalangan.
          </span>
        </label>

        {galat && <Kotak nada="galat">{galat}</Kotak>}
        {pesan && <Kotak nada="baik">{pesan}</Kotak>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="btn" onClick={kirim} disabled={!bisaDiubah || pending || jumlah === 0}>
            {pending ? 'Menyimpan…' : props.sudahKirim ? 'Perbarui ketersediaan' : 'Kirim ketersediaan'}
          </button>
          <span className="t-small" style={{ color: 'var(--muted-2)' }}>
            {jumlah} slot dipilih
          </span>
        </div>
      </div>
    </div>
  );
}

function KartuSlot({
  periodeId,
  slot,
  dicentang,
  bisaDiubah,
  onAlih,
}: {
  periodeId: string;
  slot: SlotTampil;
  dicentang: boolean;
  bisaDiubah: boolean;
  onAlih: () => void;
}) {
  const [bukaSanggah, setBukaSanggah] = useState(false);
  const [alasan, setAlasan] = useState('');
  const [hasil, setHasil] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pending, mulai] = useTransition();

  function kirimSanggahan() {
    setGalat(null);
    mulai(async () => {
      const r = await sanggahBentrok({ slotId: slot.id, alasan, periodeId });
      if (r.ok) {
        setHasil(r.pesan);
        setBukaSanggah(false);
      } else setGalat(r.error);
    });
  }

  const menungguSanggahan = slot.sanggahan_status === 'menunggu';

  // Yang sudah tercentang selalu boleh DILEPAS — kalau tidak, slot hasil impor
  // yang kini dianggap bentrok akan terkunci-tercentang selamanya dan pengajar
  // tidak bisa menyimpan apa pun.
  const terkunciCentang = !bisaDiubah || (!dicentang && !slot.boleh_tambah);

  // Dua sebab berbeda, dua nada berbeda: gembok = bentrok jadwal Anda sendiri
  // (bisa disanggah), sedangkan slot offline hanya dibatasi kebijakan
  // koordinator — bukan salah pengajar, jadi tidak pakai gembok/sanggahan.
  const kebijakanOffline = slot.mode === 'offline' && !slot.tersimpan && !slot.terkunci;
  const redup = !slot.boleh_tambah && !slot.tersimpan;

  return (
    <div
      className="card-flat"
      style={{
        padding: '10px 12px',
        opacity: redup ? 0.75 : 1,
        borderLeft: slot.butuh_pengajar ? '3px solid var(--accent)' : undefined,
      }}
    >
      <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: terkunciCentang ? 'default' : 'pointer' }}>
        <input
          type="checkbox"
          checked={dicentang}
          disabled={terkunciCentang}
          onChange={onAlih}
          style={{ marginTop: 3 }}
        />
        <span style={{ flex: 1 }}>
          <span className="t-body" style={{ fontWeight: 600 }}>
            {slot.terkunci ? '🔒 ' : kebijakanOffline ? '📍 ' : ''}
            {slot.label}
          </span>
          {slot.mode === 'offline' && (
            <span className="t-small" style={{ color: 'var(--muted-2)' }}>
              {' '}· Offline{slot.lokasi ? ` — ${slot.lokasi}` : ''}
            </span>
          )}

          {slot.terkunci && slot.alasan_kunci && (
            <span className="t-small" style={{ display: 'block', color: 'var(--muted-2)', marginTop: 2 }}>
              {slot.alasan_kunci}
            </span>
          )}

          {slot.terkunci && slot.tersimpan && (
            <span className="t-small" style={{ display: 'block', color: 'var(--muted-2)', marginTop: 2 }}>
              Pilihan lama Anda tetap tersimpan. Lepaskan centang bila jadwal ini memang tidak
              lagi Anda sanggupi.
            </span>
          )}

          {kebijakanOffline && (
            <span className="t-small" style={{ display: 'block', color: 'var(--muted-2)', marginTop: 2 }}>
              Slot offline diatur koordinator — hubungi koordinator bila Anda menyanggupi jam ini.
            </span>
          )}

          <span className="t-small" style={{ display: 'block', color: 'var(--muted-2)', marginTop: 4 }}>
            {slot.butuh_pengajar && (
              <strong style={{ color: 'var(--accent)' }}>Butuh pengajar · </strong>
            )}
            {slot.antre} pendaftar menunggu · {slot.pengajar_tersedia} pengajar tersedia
            {slot.butuh_halaqah > 0 ? (
              <>
                {' · '}
                <strong style={{ color: 'var(--ink)' }}>butuh {slot.butuh_halaqah} halaqah</strong>
              </>
            ) : null}
          </span>

          {slot.peluang && (
            <span className="t-small" style={{ display: 'block', color: 'var(--muted-2)' }}>
              Riwayat: {slot.peluang}
            </span>
          )}
        </span>
      </label>

      {/* Sanggahan hanya relevan untuk kunci karena bentrok (`slot.terkunci`).
          Slot offline yang tidak bentrok bukan perkara yang bisa disanggah —
          itu kebijakan, bukan klaim jadwal yang keliru. */}
      {slot.terkunci && bisaDiubah && !menungguSanggahan && !hasil && (
        <div style={{ marginTop: 6 }}>
          {!bukaSanggah ? (
            <button className="btn btn-sm btn-ghost" onClick={() => setBukaSanggah(true)}>
              Sanggah
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <textarea
                className="input"
                rows={2}
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                placeholder="Contoh: halaqah itu sudah selesai bulan lalu, tinggal tercatat di sheet"
              />
              {galat && <span className="t-small" style={{ color: 'var(--danger)' }}>{galat}</span>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-sm" onClick={kirimSanggahan} disabled={pending}>
                  {pending ? 'Mengirim…' : 'Kirim sanggahan'}
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => setBukaSanggah(false)}>
                  Batal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {(menungguSanggahan || hasil) && (
        <p className="t-small" style={{ color: 'var(--muted-2)', marginTop: 6, marginBottom: 0 }}>
          {hasil ?? 'Sanggahan sedang ditinjau koordinator.'}
        </p>
      )}
    </div>
  );
}

function Kotak({ nada, children }: { nada: 'baik' | 'galat' | 'netral'; children: React.ReactNode }) {
  const warna =
    nada === 'galat'
      ? { border: 'var(--danger)', teks: 'var(--danger)' }
      : nada === 'baik'
        ? { border: 'var(--hijau-ink)', teks: 'var(--hijau-ink)' }
        : { border: 'var(--line)', teks: 'var(--muted-2)' };
  return (
    <div
      className="t-small"
      style={{
        border: `1px solid ${warna.border}`,
        color: warna.teks,
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}
