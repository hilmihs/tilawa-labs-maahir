import { redirect } from 'next/navigation';

// Link pendek universal untuk ketua kelas: /isi → form pengisian keterangan.
// Pakai redirect() (Location relatif) supaya aman di belakang reverse proxy
// (tak bocor ke host internal). Middleware menangani login + redirect-after-login.
export const dynamic = 'force-dynamic';

export default function IsiRedirect() {
  redirect('/hits/ketua');
}
