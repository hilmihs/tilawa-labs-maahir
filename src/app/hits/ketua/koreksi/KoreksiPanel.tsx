'use client';
import { useMemo, useState, useTransition } from 'react';
import { submitKoreksi } from './actions';
import type { KoreksiItemInput } from '@/lib/hits-koreksi';

type Slot = { level: string; pertemuan_no: number; tanggal: string; label: string };

export function KoreksiPanel({ halaqahId, slots }: { halaqahId: string; slots: Slot[] }) {
  const [items, setItems] = useState<KoreksiItemInput[]>([]);
  const [pending, start] = useTransition();
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const add = (it: KoreksiItemInput) => setItems((p) => [...p, it]);
  const removeAt = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));

  // Nomor yang sedang dipakai per tahap — dari daftar pertemuan sekarang plus
  // penambahan yang sudah masuk draft. Nomor yang pernah dihapus tidak ada di
  // `slots`, jadi otomatis boleh dipakai lagi.
  const takenByLevel = useMemo(() => {
    const m = new Map<string, Set<number>>();
    const put = (level: string, no: number) => {
      const set = m.get(level) ?? new Set<number>();
      set.add(no);
      m.set(level, set);
    };
    for (const s of slots) put(s.level, s.pertemuan_no);
    for (const it of items) {
      if (it.jenis === 'tambah' && it.level && it.pertemuan_no != null) put(it.level, it.pertemuan_no);
    }
    return m;
  }, [slots, items]);

  function submit() {
    setErr(null);
    start(async () => {
      const res = await submitKoreksi(halaqahId, items);
      if (res?.error) { setErr(res.error); return; }
      if (res?.waUrl) setWaUrl(res.waUrl);
    });
  }

  if (waUrl) {
    return (
      <div className="card-flat" style={{ padding: 16, textAlign: 'center' }}>
        <p className="t-body" style={{ fontWeight: 600, marginBottom: 12 }}>Pengajuan terkirim — minta persetujuan koordinator.</p>
        <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-block">Kirim WA ke koordinator</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SetMulai onAdd={add} />
      <TambahPertemuan onAdd={add} taken={takenByLevel} />
      <div>
        <div className="t-tiny" style={{ marginBottom: 6, color: 'var(--muted-2)' }}>Pertemuan saat ini — pilih aksi:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {slots.map((s) => <SlotRow key={`${s.level}-${s.pertemuan_no}`} slot={s} onAdd={add} />)}
        </div>
      </div>
      {items.length > 0 && (
        <div className="card-flat" style={{ padding: 12 }}>
          <div className="t-tiny" style={{ marginBottom: 6 }}>Draft koreksi ({items.length}):</div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
              <span>{describe(it)}</span>
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => removeAt(i)}>hapus</button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="t-small" style={{ color: 'var(--danger)' }}>{err}</p>}
      <button type="button" className="btn btn-primary btn-block" disabled={pending || items.length === 0} onClick={submit}>
        {pending ? 'Mengirim…' : 'Kirim pengajuan'}
      </button>
    </div>
  );
}

function describe(it: KoreksiItemInput): string {
  if (it.jenis === 'set_mulai') return `Set mulai: ${it.tanggal}`;
  if (it.jenis === 'tambah') return `Tambah ${it.pertemuan_no != null ? `#${it.pertemuan_no} ` : ''}(${it.level}): ${it.tanggal}`;
  if (it.jenis === 'hapus') return `Hapus #${it.pertemuan_no} (${it.level})`;
  return `Ubah #${it.pertemuan_no} (${it.level}) → ${it.tanggal}`;
}

function SetMulai({ onAdd }: { onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Set tanggal mulai kelas (observasi sebelum tanggal ini akan dihapus)</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button type="button" className="btn btn-sm" disabled={!d} onClick={() => { onAdd({ jenis: 'set_mulai', tanggal: d }); setD(''); }}>+ set mulai</button>
      </div>
    </div>
  );
}

function TambahPertemuan({ onAdd, taken }: { onAdd: (it: KoreksiItemInput) => void; taken: Map<string, Set<number>> }) {
  const [lv, setLv] = useState('qoidah_nuroniyyah');
  const [d, setD] = useState('');
  const [no, setNo] = useState('');

  const used = taken.get(lv) ?? new Set<number>();
  const maxNo = used.size ? Math.max(...used) : 0;
  // Lubang di bawah nomor tertinggi = bekas pertemuan yang dihapus. Ini yang
  // biasanya mau diisi ulang, jadi ditawarkan langsung.
  const lubang: number[] = [];
  for (let i = 1; i <= maxNo; i++) if (!used.has(i)) lubang.push(i);

  const noNum = no.trim() === '' ? null : Number(no);
  const noSalah = noNum != null && (!Number.isInteger(noNum) || noNum < 1 || noNum > 200);
  const noBentrok = noNum != null && used.has(noNum);
  const bisaTambah = !!d && !noSalah && !noBentrok;

  return (
    <div className="card-flat" style={{ padding: 12 }}>
      <div className="t-tiny" style={{ marginBottom: 4 }}>Tambah pertemuan (yang terlewat)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <select value={lv} onChange={(e) => setLv(e.target.value)} className="input">
          <option value="qoidah_nuroniyyah">Nuroniyyah</option>
          <option value="perbaikan_bacaan">Perbaikan</option>
        </select>
        <input
          type="number" min={1} max={200} inputMode="numeric" value={no}
          onChange={(e) => setNo(e.target.value)} className="input"
          placeholder={`#${maxNo + 1}`} style={{ width: 88 }} aria-label="Nomor pertemuan"
        />
        <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ flex: 1 }} />
        <button
          type="button" className="btn btn-sm" disabled={!bisaTambah}
          onClick={() => {
            onAdd({ jenis: 'tambah', level: lv as KoreksiItemInput['level'], pertemuan_no: noNum, tanggal: d });
            setD(''); setNo('');
          }}
        >+ tambah</button>
      </div>
      <div className="t-tiny" style={{ marginTop: 6, color: noBentrok || noSalah ? 'var(--danger)' : 'var(--muted-2)' }}>
        {noBentrok
          ? `Pertemuan ${noNum} sudah ada — pakai nomor lain, atau ubah tanggalnya lewat daftar di bawah.`
          : noSalah
            ? 'Nomor pertemuan harus 1–200.'
            : lubang.length > 0
              ? `Nomor kosong (bekas dihapus): ${lubang.join(', ')}. Kosongkan nomor untuk taruh di urutan terakhir (#${maxNo + 1}).`
              : `Kosongkan nomor untuk taruh di urutan terakhir (#${maxNo + 1}).`}
      </div>
    </div>
  );
}

function SlotRow({ slot, onAdd }: { slot: Slot; onAdd: (it: KoreksiItemInput) => void }) {
  const [d, setD] = useState('');
  return (
    <div className="card" style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1 }}>{slot.label}</span>
      <button type="button" className="btn btn-xs btn-ghost" onClick={() => onAdd({ jenis: 'hapus', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no })}>hapus</button>
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} className="input" style={{ width: 150 }} />
      <button type="button" className="btn btn-xs" disabled={!d} onClick={() => { onAdd({ jenis: 'ubah_tanggal', level: slot.level as KoreksiItemInput['level'], pertemuan_no: slot.pertemuan_no, tanggal: d }); setD(''); }}>ubah tgl</button>
    </div>
  );
}
