import { supabaseAdmin } from '../supabase-admin';

const CATATAN_SAMPLES = [
  'Pengajar terlambat ~10 menit karena kendala teknis',
  'Jadwal digeser ke sore karena permintaan peserta',
  'Kelas selesai lebih awal, materi sudah tercakup',
  'Pengajar izin mendadak, tidak ada pengganti',
  'Koneksi internet pengajar bermasalah di awal kelas',
  'Pengajar hadir tapi audio bermasalah 15 menit pertama',
  'Kelas dimulai terlambat menunggu peserta lengkap',
  'Jadwal bentrok dengan kegiatan lain, digeser 1 jam',
];

export async function runSeedDemoObservasi(log: (s: string) => void): Promise<void> {
  log('Mengambil data kelas_hits dan ketua_kelas...');

  const { data: allKelas } = await supabaseAdmin
    .from('kelas_hits')
    .select('id, name, pengajar_id, gender')
    .order('name');

  if (!allKelas || allKelas.length === 0) {
    log('Tidak ada kelas_hits. Jalankan seed HITS dan seed Kelas HITS terlebih dahulu.');
    return;
  }

  const { data: allKetua } = await supabaseAdmin
    .from('ketua_kelas')
    .select('id, kelas_hits_id')
    .eq('active', true);

  const ketuaMap = new Map((allKetua ?? []).map((k) => [k.kelas_hits_id, k.id]));

  const { data: koorKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('id')
    .limit(1)
    .maybeSingle();

  log('Menghapus demo observasi sebelumnya...');
  await supabaseAdmin.from('tabayyun').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('observasi_kelas').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const kondisiOptions: ('KBBS' | 'KMT' | 'JKG' | 'KBLA' | 'LIBUR')[] = ['KBBS', 'KMT', 'JKG', 'KBLA', 'LIBUR'];
  const statusLatihanOptions: ('TAL' | 'PTML' | 'SML')[] = ['TAL', 'PTML', 'SML'];
  const alasanSamples = [
    'Ada keperluan mendadak di keluarga',
    'Sakit, tidak bisa mengajar hari ini',
    'Koneksi internet mati total di rumah',
    'Bentrok dengan jadwal kerja yang tidak bisa ditinggal',
    'Baru pulang perjalanan jauh, belum sempat istirahat',
  ];

  let obsCount = 0;
  let tabayyunCount = 0;

  const kelasToSeed = allKelas.slice(0, 20);

  for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    for (let i = 0; i < kelasToSeed.length; i++) {
      const kelas = kelasToSeed[i];
      const ketuaId = ketuaMap.get(kelas.id);
      if (!ketuaId) continue;

      // Hari ini: hanya ~10 kelas pertama terisi (sisanya belum → demo reminder)
      // Hari sebelumnya: hampir semua terisi
      if (dayOffset === 0 && i >= 10) continue;
      if (dayOffset === 1 && i >= 18) continue;

      // Variasi kondisi: campurkan KBBS dengan non-KBBS
      let kondisi: typeof kondisiOptions[number];
      if (dayOffset === 0) {
        // Hari ini: 4 KBBS, 2 KMT, 2 JKG, 1 KBLA, 1 LIBUR
        const todayPattern: typeof kondisiOptions[number][] = ['KBBS', 'KMT', 'KBBS', 'JKG', 'KBBS', 'KBLA', 'KMT', 'KBBS', 'JKG', 'LIBUR'];
        kondisi = todayPattern[i] ?? 'KBBS';
      } else {
        const idx = (i * 3 + dayOffset * 7) % kondisiOptions.length;
        kondisi = idx === 0 ? 'KBBS' : kondisiOptions[idx];
      }

      const latihanDiberikan = kondisi !== 'LIBUR' && (i + dayOffset) % 3 !== 0;
      const statusLatihan = latihanDiberikan ? statusLatihanOptions[(i + dayOffset) % 3] : null;

      const catatan = kondisi !== 'KBBS' && kondisi !== 'LIBUR'
        ? CATATAN_SAMPLES[(i + dayOffset) % CATATAN_SAMPLES.length]
        : null;

      const { data: obs, error: obsErr } = await supabaseAdmin
        .from('observasi_kelas')
        .upsert({
          kelas_hits_id: kelas.id,
          ketua_kelas_id: ketuaId,
          tanggal: dateStr,
          kondisi,
          pengajar_on_cam: null,
          latihan_mandiri_diberikan: kondisi !== 'LIBUR' ? latihanDiberikan : null,
          status_latihan_val: kondisi !== 'LIBUR' ? statusLatihan : null,
          semua_siswa_selesai_latihan: statusLatihan === 'SML' ? true : statusLatihan === 'PTML' ? false : null,
          catatan,
        }, { onConflict: 'kelas_hits_id,tanggal' })
        .select('id')
        .maybeSingle();

      if (obsErr) {
        log(`Error insert observasi ${kelas.name} ${dateStr}: ${obsErr.message}`);
        continue;
      }
      obsCount++;

      if (obs && kondisi !== 'KBBS' && kondisi !== 'LIBUR' && koorKK) {
        const deadline = new Date();
        deadline.setHours(deadline.getHours() + 48);

        // Campurkan status dalam satu hari: index genap = pending, ganjil = awaiting_reason
        // Hari lama (>=2): decided
        let status: 'pending' | 'awaiting_reason' | 'decided';
        if (dayOffset >= 3) {
          status = 'decided';
        } else if (dayOffset === 2) {
          status = i % 2 === 0 ? 'decided' : 'awaiting_reason';
        } else if (dayOffset === 1) {
          status = i % 3 === 0 ? 'pending' : 'awaiting_reason';
        } else {
          status = i % 2 === 0 ? 'pending' : 'awaiting_reason';
        }

        const { data: existingTab } = await supabaseAdmin
          .from('tabayyun')
          .select('id')
          .eq('observasi_id', obs.id)
          .maybeSingle();

        if (!existingTab) {
          await supabaseAdmin.from('tabayyun').insert({
            observasi_id: obs.id,
            pengajar_id: kelas.pengajar_id,
            koordinator_kk_id: koorKK.id,
            status,
            deadline_at: deadline.toISOString(),
            alasan_pengajar: status !== 'pending' ? alasanSamples[(i + dayOffset) % alasanSamples.length] : null,
            alasan_submitted_at: status !== 'pending' ? new Date().toISOString() : null,
            is_udzur_syari: status === 'decided' ? i % 3 !== 0 : null,
            keputusan_catatan: status === 'decided' ? (i % 3 !== 0 ? 'Alasan diterima, udzur syar\'i' : 'Alasan tidak diterima, perlu teguran') : null,
            decided_at: status === 'decided' ? new Date().toISOString() : null,
          });
          tabayyunCount++;
        }
      }
    }
  }

  log(`Inserted ${obsCount} observasi, ${tabayyunCount} tabayyun.`);

  log('Menambahkan demo checkin pengajar...');
  let checkinCount = 0;

  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const d = new Date(today + 'T12:00:00+07:00');
    d.setDate(d.getDate() - dayOffset);
    const dateStr = d.toISOString().slice(0, 10);

    for (let i = 0; i < kelasToSeed.length; i++) {
      const kelas = kelasToSeed[i];

      // Hari ini: hanya ~12 kelas pertama checkin (8 belum → demo reminder)
      // Hari sebelumnya: hampir semua
      if (dayOffset === 0 && i >= 12) continue;
      if (dayOffset === 1 && i >= 18) continue;

      // Campuran: hadir, izin, sakit
      let status: 'hadir' | 'izin' | 'sakit';
      const mod = (i + dayOffset) % 7;
      if (mod === 3) status = 'izin';
      else if (mod === 5) status = 'sakit';
      else status = 'hadir';

      const isTerlambat = status === 'hadir' && (i + dayOffset) % 5 === 0;

      const { error: checkinErr } = await supabaseAdmin
        .from('checkin_pengajar')
        .upsert({
          pengajar_id: kelas.pengajar_id,
          kelas_hits_id: kelas.id,
          tanggal: dateStr,
          status,
          checked_in_at: new Date().toISOString(),
          is_terlambat: isTerlambat,
        }, { onConflict: 'pengajar_id,kelas_hits_id,tanggal' });

      if (!checkinErr) checkinCount++;
    }
  }

  log(`Inserted ${checkinCount} checkin pengajar.`);
}
