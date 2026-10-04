import type { RoleAccess } from '@/types/db';

export const ROLE_LANDING: Record<RoleAccess['role'], string> = {
  peserta: '/2in1/peserta',
  musyrif: '/2in1/musyrif',
  koordinator: '/2in1/koordinator',
  koordinator_kehadiran: '/2in1/koordinator/kehadiran',
  syaikh: '/2in1/syaikh',
  pengajar: '/kehadiran/pengajar',
  ketua_kelas: '/hits/ketua',
  koordinator_ketua_kelas: '/observasi/koordinator',
};
