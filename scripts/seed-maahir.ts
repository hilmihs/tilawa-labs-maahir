/**
 * CLI wrapper. Logika utama di src/lib/seeds/seed-maahir.ts.
 *
 *   npm run seed-maahir
 */
import { runSeedMaahir } from '../src/lib/seeds/seed-maahir';

runSeedMaahir((s) => console.log(s)).catch((err) => {
  console.error('\n✗ Error:', err);
  process.exit(1);
});
