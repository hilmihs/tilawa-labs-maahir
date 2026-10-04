import 'server-only';
import { bolehLihatFiturTersembunyi } from '@/lib/admin-guard';

/**
 * Gerbang khusus pengiriman ke CMS tilawah.
 *
 * Fitur Ketersediaan Mengajar sendiri sudah dibuka untuk pengajar dan
 * koordinator, tetapi pengiriman ke CMS tilawah tidak ikut: CMS itu tidak punya
 * penghapusan akun yang berfungsi, sehingga satu kiriman salah tidak bisa
 * ditarik kembali. Karena server action adalah endpoint POST publik — id action
 * ikut terkirim di bundel JS — penjaga halaman saja tidak cukup; tiap action
 * pengiriman memanggil ini SETELAH cek peran.
 */
export async function jagaKirimTilawah(): Promise<void> {
  if (!(await bolehLihatFiturTersembunyi())) {
    throw new Error('Pengiriman ke CMS tilawah hanya untuk superadmin.');
  }
}
