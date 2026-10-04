// Alamat lama kirim setoran musyrif → syaikh. Halaman /2in1/musyrif/setor
// dulu memanggil alamat ini; kini memakai /api/2in1/setoran-musyrif/submit.
// Tetap dilayani (tab yang masih terbuka dengan versi lama halaman) dengan
// logika yang SAMA — dulu salinan terpisah yang menolak setoran 'checked'
// dan mengharuskan ketiga rekaman.
//
// Konfigurasi segmen (runtime, maxDuration) harus literal di berkas ini,
// tidak bisa diekspor ulang.
export const runtime = 'nodejs';
export const maxDuration = 300;

export { POST } from '@/app/api/2in1/setoran-musyrif/submit/route';
