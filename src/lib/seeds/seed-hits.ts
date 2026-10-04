/**
 * Seed data HITS: kelompok pengajar, koordinator, program kehadiran.
 * WIPE semua data HITS lalu insert ulang.
 * Password default: "hits123"
 */
import bcrypt from 'bcryptjs';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { normalizeWhatsApp } from '@/lib/whatsapp';

const PWD = 'hits123';
type G = 'ikhwan' | 'akhwat';

interface KelompokData {
  name: string;
  gender: G;
  ketua: { name: string; wa: string };
  anggota: { name: string; wa: string }[];
}

const IKHWAN_KELOMPOK: KelompokData[] = [
  {
    name: 'Kelompok 1 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Nadia Kamila Permata', wa: '82383610606' },
    anggota: [
      { name: 'Hamzah Rahman Wulandari', wa: '81298205428' },
      { name: 'Inas Wafa Lestari', wa: '081593924183' },
      { name: 'Rania Rahman Baswedan', wa: '87878874267' },
      { name: 'Syahid Latif Mahardika', wa: '0816808831526' },
      { name: 'Hamzah Kamila Saputra', wa: '081588378793' },
      { name: 'Laila Lestari', wa: '081767204770' },
      { name: 'Yasmin Wafa Saputra', wa: '081632574679' },
    ],
  },
  {
    name: 'Kelompok 2 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Amina Fitri Wijaya', wa: '81084081353' },
    anggota: [
      { name: 'Zahra Abdul Lestari', wa: '081052320830' },
      { name: 'Imran Karim Safitri', wa: '081913451802' },
      { name: 'Zahra Haura Ramadhan', wa: '081747268397' },
      { name: 'Hafsah Aziz Nugroho', wa: '0819751364854' },
      { name: 'Hafsah Rahma Hidayat', wa: '081710127482' },
      { name: 'Sakinah Haura Cahyani', wa: '85723827937' },
      { name: 'Luthfi Sabil Cahyani', wa: '081343514976' },
    ],
  },
  {
    name: 'Kelompok 3 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Ahmad Nur Nugroho', wa: '81547229165' },
    anggota: [
      { name: 'Imran Sabil Utami', wa: '81321757544' },
      { name: 'Khadijah Karim Kurniawan', wa: '081156241111' },
      { name: 'Luthfi Hakim Hidayat', wa: '081946791673' },
      { name: 'Nadia Anisa Hidayat', wa: '0816653492224' },
      { name: 'Ahmad Kamila Wulandari', wa: '0818841068771' },
      { name: 'Ahmad Hakim Hidayat', wa: '081554227752' },
      { name: 'Imran Handayani', wa: '081189728950' },
    ],
  },
  {
    name: 'Kelompok 4 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Adiba Aziz Safitri', wa: '82211162523' },
    anggota: [
      { name: 'Luthfi Kamila Wulandari', wa: '081308368893' },
      { name: 'Safiyah Hakim Maulana', wa: '081202865464' },
      { name: 'Maryam Latif Pratama', wa: '081478777303' },
      { name: 'Idris Shofia Firdaus', wa: '081305729162' },
      { name: 'Maryam Aziz Lestari', wa: '081967996363' },
      { name: 'Anas Hanifah Permata', wa: '081086495547' },
      { name: 'Azka Nabila Saputra', wa: '081382713078' },
    ],
  },
  {
    name: 'Kelompok 5 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Nadia Nur Cahyani', wa: '81491074122' },
    anggota: [
      { name: 'Syamsunnas', wa: '081978718301' },
      { name: 'Idris Hanifah Lestari', wa: '81384250868' },
      { name: 'Anas Qonita Safitri', wa: '081370942433' },
      { name: 'Ilham Rahman Handayani', wa: '81542328517' },
      { name: 'Ilham Kamila Anggraini', wa: '081902251409' },
      { name: 'Zahra Rahma Utami', wa: '85846146221' },
      { name: 'Dalila Fitri Firdaus', wa: '081066057979' },
      { name: 'Adiba Lestari', wa: '0816559252' },
    ],
  },
  {
    name: 'Kelompok 6 Ikhwan', gender: 'ikhwan',
    ketua: { name: 'Luthfi Zahira Pratama', wa: '81266623790' },
    anggota: [
      { name: 'Ahmad Anisa Ramadhan', wa: '081300668249' },
      { name: 'Adiba Haura Kurniawan', wa: '081717626897' },
      { name: 'Hadi Nur Ramadhan', wa: '081483229385' },
      { name: 'Ilham Wafa Saputra', wa: '081210409236' },
      { name: 'Adiba Abdul Anggraini', wa: '081195806827' },
      { name: 'Mudabbir', wa: '081920942274' },
      { name: 'Salma Rahman Wulandari', wa: '081617285477' },
      { name: 'Laila Rahma Maulana', wa: '081620642347' },
    ],
  },
];

const AKHWAT_KELOMPOK: KelompokData[] = [
  {
    name: 'Kelompok 1 Akhwat', gender: 'akhwat',
    ketua: { name: 'Azka Kamila Handayani', wa: '081595804136' },
    anggota: [
      { name: 'Inas Firdaus', wa: '081908371344' },
      { name: 'Rafi Hanifah Firdaus', wa: '081762050425' },
      { name: 'Rafi Qonita Lestari', wa: '081697886921' },
      { name: 'Laila Abdul Anggraini', wa: '081453748575' },
      { name: 'Dalila Nabila Mahardika', wa: '081262482151' },
      { name: 'Bilal Karim Wijaya', wa: '081943153633' },
      { name: 'Yasmin Fitri Kurniawan', wa: '081770942243' },
      { name: 'Tamim Zahira Baswedan', wa: '081759210732' },
    ],
  },
  {
    name: 'Kelompok 2 Akhwat', gender: 'akhwat',
    ketua: { name: 'Bilal Azhar Permata', wa: '081411506252' },
    anggota: [
      { name: 'Hanan Latif Mahardika', wa: '081326842969' },
      { name: "Hanan Shofia Permata", wa: '081675168940' },
      { name: 'Husna Zahira Baswedan', wa: '0813310809637' },
      { name: 'Hanan Hanifah Saputra', wa: '081399892918' },
      { name: 'Yasmin Kamila Anggraini', wa: '08125040709' },
      { name: 'Yasmin Rahman Handayani', wa: '081465744910' },
      { name: "Tamim Nabila Wulandari", wa: '081474345257' },
      { name: 'Rania Nabila Mahardika', wa: '081375001884' },
    ],
  },
  {
    name: 'Kelompok 3 Akhwat', gender: 'akhwat',
    ketua: { name: 'Zahra Firdaus', wa: '081788557280' },
    anggota: [
      { name: 'Fikri Rahma Ramadhan', wa: '081957690666' },
      { name: 'Fikri Nabila Anggraini', wa: '081039968054' },
      { name: 'Umar Shofia Firdaus', wa: '081390826555' },
      { name: 'Ridho Azhar Handayani', wa: '081131283274' },
      { name: 'Amina Rahman Syahputra', wa: '081494379012' },
      { name: 'Tamim Kamila Mahardika', wa: '081745189024' },
      { name: 'Najwa Qonita Safitri', wa: '081591248940' },
      { name: 'Hamzah Anisa Maulana', wa: '081284279393' },
    ],
  },
  {
    name: 'Kelompok 4 Akhwat', gender: 'akhwat',
    ketua: { name: 'Najwa Azhar Wulandari', wa: '081240731026' },
    anggota: [
      { name: 'Rania Haura Utami', wa: '081765207438' },
      { name: 'Ahmad Zahira Pratama', wa: '081586892605' },
      { name: 'Bilal Qonita Lestari', wa: '081545493713' },
      { name: 'Inas Rahma Utami', wa: '081048964330' },
      { name: 'Fariz Pratama', wa: '081202040094' },
      { name: 'Hidayati', wa: '081098935409' },
      { name: 'Rania Wafa Permata', wa: '081164690000' },
    ],
  },
  {
    name: 'Kelompok 5 Akhwat', gender: 'akhwat',
    ketua: { name: 'Khadijah Hakim Ramadhan', wa: '081906077954' },
    anggota: [
      { name: 'Ruqayyah', wa: '081077743618' },
      { name: 'Istiqomah Islamiyah', wa: '081904329816' },
      { name: 'Dalila Abdul Permata', wa: '081991245837' },
      { name: 'Syahid Qonita Wijaya', wa: '081735407371' },
      { name: 'Khadijah Azhar Anggraini', wa: '081455292135' },
      { name: 'Dalila Wafa Permata', wa: '081935957552' },
      { name: 'Padmiwati', wa: '081177159242' },
      { name: 'Umar Latif Baswedan', wa: '081874364819' },
    ],
  },
  {
    name: 'Kelompok 6 Akhwat', gender: 'akhwat',
    ketua: { name: 'Fariz Sabil Safitri', wa: '08120834634' },
    anggota: [
      { name: 'Syahid Aziz Firdaus', wa: '081326972372' },
      { name: 'Imran Qonita Firdaus', wa: '081512596337' },
      { name: 'Azka Rahman Mahardika', wa: '081405488484' },
      { name: 'Ruqayyah Abdul Firdaus', wa: '081562538979' },
      { name: 'Hamzah Zahira Mahardika', wa: '081843527939' },
      { name: 'Zaki Nur Utami', wa: '081209608169' },
      { name: 'Amina Zahira Handayani', wa: '081500307242' },
      { name: "Aisyah Latif Pratama", wa: '081460027880' },
    ],
  },
  {
    name: 'Kelompok 7 Akhwat', gender: 'akhwat',
    ketua: { name: 'Ruqayyah Nabila Anggraini', wa: '081496958677' },
    anggota: [
      { name: 'Nadia Rahman Syahputra', wa: '081878010402' },
      { name: 'Ilham Nabila Pratama', wa: '081967160690' },
      { name: 'Husna Kamila Mahardika', wa: '081941641988' },
      { name: 'Fikri Wafa Handayani', wa: '081711193959' },
      { name: 'Hafsah Haura Cahyani', wa: '081362092238' },
      { name: 'Salma Nur Kurniawan', wa: '081097089493' },
      { name: 'Fariz Hakim Utami', wa: '081538892398' },
      { name: 'Zaki Azhar Anggraini', wa: '081100094713' },
    ],
  },
  {
    name: 'Kelompok 8 Akhwat', gender: 'akhwat',
    ketua: { name: 'Salma Anisa Maulana', wa: '081929128988' },
    anggota: [
      { name: 'Idris Qonita Nugroho', wa: '0815745905463' },
      { name: 'Najwa Shofia Lestari', wa: '081097302448' },
      { name: 'Hanan Aziz Firdaus', wa: '081910900142' },
      { name: 'Inas Nabila Handayani', wa: '081815757406' },
      { name: 'Imran Azhar Mahardika', wa: '081039965417' },
      { name: 'Dalila Rahman Baswedan', wa: '081589081892' },
      { name: 'Tamim Anisa Baswedan', wa: '081630732359' },
      { name: 'Azka Abdul Wijaya', wa: '081425759355' },
    ],
  },
  {
    name: 'Kelompok 9 Akhwat', gender: 'akhwat',
    ketua: { name: 'Yusuf Handayani', wa: '081331947687' },
    anggota: [
      { name: 'Inas Haura Ramadhan', wa: '081281255182' },
      { name: 'Hadi Anisa Syahputra', wa: '081680665780' },
      { name: 'Umar Qonita Nugroho', wa: '081769467431' },
      { name: 'Yasmin Abdul Saputra', wa: '081410105200' },
      { name: 'Amina Kamila Permata', wa: '081351407327' },
      { name: 'Laila Aziz Safitri', wa: '081954237387' },
      { name: 'Inas Abdul Lestari', wa: '081923349949' },
      { name: 'Zahra Nabila Handayani', wa: '081631928473' },
    ],
  },
  {
    name: 'Kelompok 10 Akhwat', gender: 'akhwat',
    ketua: { name: 'Rania Fitri Firdaus', wa: '081244347890' },
    anggota: [
      { name: 'Amina Nur Cahyani', wa: '081913830975' },
      { name: 'Ilham Abdul Saputra', wa: '081490729713' },
      { name: 'Aisyah Rahma Cahyani', wa: '081378242134' },
      { name: 'Maryam', wa: '081750779066' },
      { name: 'Fikri Aziz Wijaya', wa: '081058861148' },
      { name: 'Anas Azhar Wulandari', wa: '081925947747' },
    ],
  },
  {
    name: 'Kelompok 11 Akhwat', gender: 'akhwat',
    ketua: { name: 'Syahid Shofia Permata', wa: '081166166672' },
    anggota: [
      { name: 'Anas Shofia Lestari', wa: '0813122863993' },
      { name: 'Yasmin Nabila Pratama', wa: '081488466417' },
      { name: 'Naufal Rahman Mahardika', wa: '081529814612' },
      { name: 'Naufal Nabila Saputra', wa: '081288841744' },
      { name: "Hadi Hakim Maulana", wa: '08184633307' },
      { name: 'Syahid Hanifah Saputra', wa: '081686886832' },
      { name: 'Zaki Sabil Nugroho', wa: '081448855561' },
    ],
  },
  {
    name: 'Kelompok 12 Akhwat', gender: 'akhwat',
    ketua: { name: 'Yusuf Qonita Firdaus', wa: '0816718189351' },
    anggota: [
      { name: 'Idris Latif Baswedan', wa: '081624870386' },
      { name: 'Tamim Rahman Pratama', wa: '081102657460' },
      { name: 'Ridho Pratama', wa: '081072068788' },
      { name: 'Safiyah Karim Firdaus', wa: '081288550191' },
      { name: 'Najwa Hanifah Permata', wa: '081342196686' },
      { name: 'Nafilatullatifah', wa: '081606722283' },
      { name: "Naufal Fitri Nugroho", wa: '081229733084' },
    ],
  },
  {
    name: 'Kelompok 13 Akhwat', gender: 'akhwat',
    ketua: { name: 'Fariz Azhar Handayani', wa: '081889994618' },
    anggota: [
      { name: 'Safiyah Sabil Kurniawan', wa: '081833414680' },
      { name: 'Durrotusyifa', wa: '081141972386' },
      { name: 'Zaki Hakim Ramadhan', wa: '081524445011' },
      { name: 'Ridho Sabil Safitri', wa: '08155892179' },
      { name: 'Bilal Saputra', wa: '081339400417' },
      { name: 'Ilham Fitri Kurniawan', wa: '081633893959' },
      { name: 'Naufal Kamila Handayani', wa: '081243287426' },
      { name: 'Salma Kamila Saputra', wa: '081989641308' },
    ],
  },
];

const ALL_KELOMPOK = [...IKHWAN_KELOMPOK, ...AKHWAT_KELOMPOK];

const KOORDINATOR_KK = [
  { name: 'Koordinator KK Ikhwan', gender: 'ikhwan' as G, wa: '+6281547229165' },
  { name: 'Koordinator KK Akhwat', gender: 'akhwat' as G, wa: '+62 878-7361-1753' },
];

const PROGRAMS = [
  { name: 'Kajian At-Tibyan', hari: ['sabtu'], waktu_mulai: '08:45', waktu_selesai: '10:00' },
];

const NIL = '00000000-0000-0000-0000-000000000000';
const del = (table: string) => supabaseAdmin.from(table).delete().neq('id', NIL);

export async function runSeedHits(log: (s: string) => void) {
  log('Hashing password default…');
  const hash = await bcrypt.hash(PWD, 12);

  // -- Preserve superadmin records --
  const { data: existingKoorKK } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .select('name, gender, whatsapp_number, password_hash')
    .not('whatsapp_number', 'in', `(${KOORDINATOR_KK.map(k => normalizeWhatsApp(k.wa)).join(',')})`);

  log('Membersihkan data HITS lama…');
  await del('audit_log');
  await del('matrix_rekap');
  await del('teguran');
  await del('jadwal_pindah');
  await del('tabayyun');
  await del('observasi_kelas');
  await del('libur_program');
  await del('pengajuan_alasan');
  await del('checkin_pengajar');
  await del('penilaian_pedagogis');
  await del('penilaian_masyaikh');
  await del('ketua_kelas');
  await del('kelas_hits');
  await del('pengajar');
  await del('kelompok_pengajar');
  await del('koordinator_ketua_kelas');
  await del('program_kehadiran');
  log('✓ Bersih');

  // -- Program Kehadiran --
  const { data: progs, error: progErr } = await supabaseAdmin
    .from('program_kehadiran')
    .insert(PROGRAMS.map((p) => ({ ...p, active: true })))
    .select('id, name');
  if (progErr) throw progErr;
  log(`✓ ${progs!.length} program kehadiran`);

  // -- Koordinator Ketua Kelas --
  const { data: koorKK, error: kkErr } = await supabaseAdmin
    .from('koordinator_ketua_kelas')
    .insert(KOORDINATOR_KK.map((k) => ({
      name: k.name,
      gender: k.gender,
      whatsapp_number: normalizeWhatsApp(k.wa),
      password_hash: hash,
    })))
    .select('id, name, gender');
  if (kkErr) throw kkErr;
  log(`✓ ${koorKK!.length} koordinator KK`);

  // Re-insert preserved superadmin koordinator_ketua_kelas
  if (existingKoorKK && existingKoorKK.length > 0) {
    const { error } = await supabaseAdmin.from('koordinator_ketua_kelas').insert(existingKoorKK);
    if (!error) log(`✓ ${existingKoorKK.length} koordinator KK tambahan di-restore`);
  }

  // -- Kelompok & Pengajar --
  const seenWa = new Set<string>();
  let totalPengajar = 0;

  for (const kel of ALL_KELOMPOK) {
    const { data: kelRow, error: kelErr } = await supabaseAdmin
      .from('kelompok_pengajar')
      .insert({ name: kel.name, gender: kel.gender })
      .select('id')
      .single();
    if (kelErr) throw kelErr;
    const kelompokId = kelRow.id;

    const rows: {
      name: string;
      gender: G;
      whatsapp_number: string;
      password_hash: string;
      kelompok_id: string;
      is_ketua: boolean;
    }[] = [];

    const ketuaWa = normalizeWhatsApp(kel.ketua.wa);
    if (!seenWa.has(ketuaWa)) {
      seenWa.add(ketuaWa);
      rows.push({
        name: kel.ketua.name, gender: kel.gender,
        whatsapp_number: ketuaWa, password_hash: hash,
        kelompok_id: kelompokId, is_ketua: true,
      });
    }

    for (const a of kel.anggota) {
      const wa = normalizeWhatsApp(a.wa);
      if (seenWa.has(wa)) {
        log(`  ⚠ Skip duplikat: ${a.name} (${wa})`);
        continue;
      }
      seenWa.add(wa);
      rows.push({
        name: a.name, gender: kel.gender,
        whatsapp_number: wa, password_hash: hash,
        kelompok_id: kelompokId, is_ketua: false,
      });
    }

    if (rows.length > 0) {
      const { error: pErr } = await supabaseAdmin.from('pengajar').insert(rows);
      if (pErr) throw pErr;
      totalPengajar += rows.length;
    }
    log(`✓ ${kel.name} (${rows.length} pengajar)`);
  }
  log(`Total: ${totalPengajar} pengajar`);

  // -- Demo checkin data --
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const { data: somePengajar } = await supabaseAdmin
    .from('pengajar')
    .select('id, name, kelompok_id')
    .eq('gender', 'ikhwan')
    .limit(4);

  const tibyanId = progs!.find((p) => p.name === 'Kajian At-Tibyan')?.id;

  if (somePengajar && somePengajar.length >= 3 && tibyanId) {
    const checkins = [
      { pengajar_id: somePengajar[0].id, program_id: tibyanId, tanggal: yesterday, status: 'hadir', is_terlambat: false },
      { pengajar_id: somePengajar[1].id, program_id: tibyanId, tanggal: yesterday, status: 'hadir', is_terlambat: true },
      { pengajar_id: somePengajar[2].id, program_id: tibyanId, tanggal: yesterday, status: 'izin', is_terlambat: false },
    ];
    const { error: ciErr } = await supabaseAdmin.from('checkin_pengajar').insert(checkins);
    if (ciErr) log(`⚠ Checkin error: ${ciErr.message}`);
    else log(`✓ ${checkins.length} demo checkin`);

    const alasan = [
      {
        pengajar_id: somePengajar[1].id, program_id: tibyanId,
        tanggal: yesterday, jenis: 'terlambat',
        alasan: 'Macet di jalan, sudah berangkat dari rumah tepat waktu.',
        status: 'pending',
      },
      {
        pengajar_id: somePengajar[2].id, program_id: tibyanId,
        tanggal: yesterday, jenis: 'alpa',
        alasan: 'Ada keperluan keluarga mendadak yang tidak bisa ditunda.',
        status: 'accepted',
        decided_by: somePengajar[0].id,
        decided_at: new Date().toISOString(),
      },
    ];
    const { error: aErr } = await supabaseAdmin.from('pengajuan_alasan').insert(alasan);
    if (aErr) log(`⚠ Alasan error: ${aErr.message}`);
    else log(`✓ ${alasan.length} demo pengajuan alasan`);
  }

  // Demo libur
  const nextSaturday = new Date();
  nextSaturday.setDate(nextSaturday.getDate() + ((6 - nextSaturday.getDay() + 7) % 7 || 7));
  const saturdayStr = nextSaturday.toISOString().slice(0, 10);

  if (tibyanId && koorKK) {
    const { error: libErr } = await supabaseAdmin.from('libur_program').insert({
      program_id: tibyanId,
      tanggal: saturdayStr,
      keterangan: 'Libur demo — Kajian At-Tibyan ditiadakan',
      created_by_id: koorKK[0].id,
    });
    if (libErr) log(`⚠ Libur error: ${libErr.message}`);
    else log(`✓ 1 demo libur (${saturdayStr})`);
  }

  log(`Password default semua akun HITS: "${PWD}"`);
}
