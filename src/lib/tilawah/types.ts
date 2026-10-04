/**
 * Kontrak CMS tilawah (Laravel + Sanctum + Inertia).
 *
 * BUKAN API publik: tidak ada token, tidak ada dokumentasi resmi. Bentuk di sini
 * hasil pemetaan `dashboard_medu/API_MAP.md` ditambah probe langsung ke staging
 * pada 30 Agustus 2026. Perlakukan sebagai kontrak rapuh — CMS bisa berubah tanpa
 * pemberitahuan, jadi setiap pemanggil harus siap menerima bentuk tak terduga.
 */

/** Amplop baku semua respons. */
export interface TilawahEnvelope<T> {
  status: 'success' | 'error' | string;
  code?: number;
  message?: string;
  data?: T;
  spent?: number;
}

export interface TilawahPagination {
  total: number;
  per_page: number;
  current_page: number;
  last_page: number;
}

export interface TilawahProgram {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  status: number;
}

export interface TilawahBatch {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  program_id: number;
  halaqohs_count?: number;
  gurus_count?: number;
  murids_count?: number;
  pertemuan_count?: number;
}

export interface TilawahLevel {
  id: number;
  name: string;
  order: number | null;
  status: number;
}

/**
 * Master hari. `int_days` memakai 0 = Senin … 6 = Ahad — sejajar dengan
 * `ks_slot.hari_idx`, sehingga usulan pemetaan bisa dihitung.
 *
 * PERINGATAN: sebagian baris punya `int_days` pincang. Probe staging menemukan
 * id 3 "Selasa, Jum'at" berisi [1] saja dan id 4 "Sabtu, Ahad" berisi [5] saja,
 * padahal namanya menyebut dua hari. Pencocokan otomatis karena itu tidak boleh
 * langsung dipakai — harus disahkan koordinator.
 */
export interface TilawahDay {
  id: number;
  name: string;
  int_days: number[];
  status: number;
}

export interface TilawahSession {
  id: number;
  name: string;
  /** "06:00:00" */
  start_hour: string;
  end_hour: string;
  status: number;
}

export interface TilawahUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  user_code: string | null;
  gender: number | null;
  role?: string;
}

export interface TilawahHalaqah {
  id: number;
  name: string;
  type: string | null;
  level_id?: number | null;
  day_id?: number | null;
  session_id?: number | null;
  batch_id?: number | null;
}

/** Badan POST /api/halaqah. `user_id` = guru (satu guru per halaqah). */
export interface BuatHalaqahBody {
  batch_id: number;
  name: string;
  type: 'online' | 'offline' | 'hybrid';
  level_id: number;
  day_id: number;
  session_id: number;
  description: string;
  user_id: number;
  status: 1;
}

/**
 * Badan POST /api/users untuk murid.
 * `email` WAJIB (422 bila kosong) walau banyak murid lama bernilai null hasil impor.
 * `gender`: 1 = laki-laki, 2 = perempuan.
 */
export interface BuatMuridBody {
  name: string;
  email: string;
  phone: string;
  user_code: '';
  gender: 1 | 2;
  role: 'murid';
  bio: '';
  wag: string;
  halaqah_id: number | null;
  old_halaqah_id: null;
  move_reason: string;
  password: string;
  password_confirmation: string;
  batch_id: number;
  meta: { bio: ''; wag: string };
}

/**
 * Badan enrolment: POST /api/users/{id} dengan `_method: "PUT"`.
 *
 * BUKAN pembaruan sebagian. Mengirim hanya `halaqah_id` + `move_reason`
 * menghasilkan 422 "The name field is required." — sama seperti `pertemuans`,
 * seluruh field wajib disertakan ulang. `move_reason` juga wajib (422 bila kosong).
 */
export interface EnrolMuridBody {
  _method: 'PUT';
  name: string;
  email: string;
  phone: string;
  user_code: string;
  gender: 1 | 2;
  role: 'murid';
  bio: string;
  wag: string;
  batch_id: number;
  halaqah_id: number;
  old_halaqah_id: number | null;
  move_reason: string;
  meta: { bio: string; wag: string };
}

/**
 * Badan POST /api/pertemuans. Satu panggilan per pertemuan — tidak ada endpoint
 * bulk, jadi 22 pertemuan berarti 22 panggilan.
 *
 * `end_session_date` HARUS lebih besar dari `start_session_date`; bila sama, CMS
 * membalas 400 "The end session date field must be a date after start session date."
 */
export interface BuatPertemuanBody {
  name: string;
  order: number;
  type: 'online' | 'offline' | 'hybrid';
  /** "YYYY-MM-DD HH:MM:SS" */
  start_session_date: string;
  end_session_date: string;
  guru_id: number;
  online_url: string;
  offline_place: string;
  notes: string;
  task_name: string;
  task_description: string;
  task_due: null;
  status: 1;
  moduls: [];
  /** "YYYY-MM-DD" */
  schedule_date: string;
  halaqah_id: number;
  batch_id: number;
}
