// Orkestrasi PULL (server): tarik semua program tilawah_api → map → diff vs mirror
// → tulis eval_sync_stage + eval_sync_run. TIDAK menyentuh eval_* langsung.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getPrograms, getPengajar, getHalaqah, getPeserta } from './client';
import { mapBatch, mapPengajar, mapHalaqah, mapPeserta } from './map';
import { diffEntity, type DiffRow } from './diff';
import type {
  MirrorBatch, MirrorPengajar, MirrorHalaqah, MirrorPeserta, MirrorEntity,
} from './types';

const COMPARE: Record<MirrorEntity, string[]> = {
  batch: ['nama', 'aktif', 'family', 'batch_label', 'batch_order'],
  pengajar: ['nama', 'gender', 'whatsapp'],
  halaqah: ['nama', 'gender', 'level', 'pengajar_id', 'batch_id'],
  peserta: ['nama', 'gender', 'halaqah_id', 'urutan'],
};

/** Tarik & petakan snapshot lengkap dari semua program tilawah_api. */
async function fetchSnapshot(): Promise<{
  generatedAt: string;
  batch: MirrorBatch[]; pengajar: MirrorPengajar[];
  halaqah: MirrorHalaqah[]; peserta: MirrorPeserta[];
}> {
  const { programs, meta } = await getPrograms();
  const tilawah = programs.filter((p) => p.dataSourceType === 'tilawah_api');

  const batch = tilawah.map(mapBatch);
  const pengajarMap = new Map<string, MirrorPengajar>(); // dedup lintas-program by id (wa:)
  const halaqah: MirrorHalaqah[] = [];
  const peserta: MirrorPeserta[] = [];

  for (const p of tilawah) {
    const [pj, hq, ps] = await Promise.all([
      getPengajar(p.slug), getHalaqah(p.slug), getPeserta(p.slug),
    ]);
    for (const r of pj) { const m = mapPengajar(p.slug, r); pengajarMap.set(m.id, m); }
    for (const r of hq) {
      halaqah.push(mapHalaqah(p.slug, r));
      // pengajar halaqah yang tak muncul di /pengajar tetap terdaftar (by guruPhone/nama)
      const m = mapPengajar(p.slug, { pengajar: r.pengajar ?? '(tanpa pengajar)', phone: r.guruPhone, genders: [r.gender] });
      if (!pengajarMap.has(m.id)) pengajarMap.set(m.id, m);
    }
    ps.forEach((r, i) => peserta.push(mapPeserta(p.slug, r, i)));
  }
  return { generatedAt: meta.generatedAt, batch, pengajar: [...pengajarMap.values()], halaqah, peserta };
}

/**
 * Baca mirror sekarang. Error DIANGKAT, tidak ditelan: shim tak pernah reject,
 * jadi kueri gagal (mis. kolom belum ada karena migrasi belum jalan) tadinya
 * cuma menghasilkan data null → mirror terbaca kosong → diff menstage SELURUH
 * baris sebagai 'create', sementara runPull tetap melapor status 'ok'.
 * Koordinator lalu melihat layar penuh create palsu tanpa tanda ada yang salah.
 * Dengan throw, runPull menangkapnya dan mencatat status 'error'.
 */
async function currentMirror<T>(table: string, cols: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin.from(table).select(cols);
  if (error) throw new Error(`baca mirror ${table} gagal: ${error.message}`);
  return (data ?? []) as T[];
}

/** Tandai flag "tabrakan" pada diff sebelum ditulis (Section B). */
async function annotate(diffs: DiffRow[]): Promise<DiffRow[]> {
  for (const d of diffs) {
    if (d.entity === 'halaqah' && d.op === 'update') {
      const b = d.before as { pengajar_id?: string } | null;
      const a = d.after as { pengajar_id?: string } | null;
      if (b && a && b.pengajar_id !== a.pengajar_id) {
        const { data } = await supabaseAdmin
          .from('evaluasi_sesi').select('id').eq('halaqah_id', d.entity_id).limit(1);
        if ((data ?? []).length) d.flags.push('pengajar-ganti-saat-sesi-ada');
      }
    }
    if (d.entity === 'peserta' && d.op === 'deactivate') {
      const { data } = await supabaseAdmin
        .from('evaluasi_nilai').select('id').eq('peserta_id', d.entity_id).limit(1);
      if ((data ?? []).length) d.flags.push('deactivate-ada-nilai');
    }
    const after = d.after as { gender?: string | null } | null;
    if (after && (after.gender === null || after.gender === undefined)) d.flags.push('gender-kosong');
  }
  return diffs;
}

/** Jalankan satu putaran pull. Return ringkasan. */
export async function runPull(): Promise<{ runId: string; total: number; counts: Record<string, number> }> {
  const { data: runRow } = await supabaseAdmin
    .from('eval_sync_run').insert({ status: 'running' }).select('id').single();
  const runId = (runRow as { id: string }).id;

  try {
    const snap = await fetchSnapshot();
    const curBatch = await currentMirror<MirrorBatch>(
      'eval_batch', 'id, nama, aktif, family, batch_label, batch_order'
    );
    const curPeng = await currentMirror('eval_pengajar', 'id, nama, gender, whatsapp');
    // `kurasi` ikut dibaca: kolom yang sudah disunting pengajar dikecualikan
    // dari pembandingan (lihat diff.ts + src/lib/evaluasi-kurasi.ts).
    const curHal = await currentMirror('eval_halaqah', 'id, nama, gender, level, pengajar_id, batch_id, ambang_ujian, kurasi');
    const curPes = await currentMirror('eval_peserta', 'id, nama, gender, halaqah_id, urutan, aktif, kurasi');

    let diffs: DiffRow[] = [
      ...diffEntity('batch', snap.batch as never, curBatch as never, COMPARE.batch),
      ...diffEntity('pengajar', snap.pengajar as never, curPeng as never, COMPARE.pengajar),
      ...diffEntity('halaqah', snap.halaqah as never, curHal as never, COMPARE.halaqah),
      ...diffEntity('peserta', snap.peserta as never, curPes as never, COMPARE.peserta),
    ];
    diffs = await annotate(diffs);

    // eval_halaqah & eval_pengajar tak punya kolom 'aktif' → buang usulan deactivate
    // untuk keduanya (hanya batch & peserta yang bisa di-nonaktifkan).
    diffs = diffs.filter((d) => !(d.op === 'deactivate' && (d.entity === 'halaqah' || d.entity === 'pengajar')));

    // Hapus baris pending lama (belum di-apply/reject) supaya idempotent, lalu insert baru.
    await supabaseAdmin.from('eval_sync_stage').delete().is('applied_at', null).eq('rejected', false);
    if (diffs.length) {
      await supabaseAdmin.from('eval_sync_stage').insert(
        diffs.map((d) => ({
          run_id: runId, entity: d.entity, op: d.op, entity_id: d.entity_id,
          before: d.before, after: d.after, flags: d.flags,
        }))
      );
    }

    const counts: Record<string, number> = {};
    for (const d of diffs) counts[`${d.entity}.${d.op}`] = (counts[`${d.entity}.${d.op}`] ?? 0) + 1;

    await supabaseAdmin.from('eval_sync_run').update({
      finished_at: new Date().toISOString(),
      source_generated_at: snap.generatedAt,
      counts, status: 'ok',
    }).eq('id', runId);

    return { runId, total: diffs.length, counts };
  } catch (e) {
    await supabaseAdmin.from('eval_sync_run').update({
      finished_at: new Date().toISOString(),
      status: 'error', error: e instanceof Error ? e.message : String(e),
    }).eq('id', runId);
    throw e;
  }
}
