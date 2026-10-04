/**
 * Stubbed on the demo branch.
 *
 * The real module carries production rosters — people's names paired with their
 * WhatsApp numbers — and it is imported by a coordinator server action, so on a
 * deployment whose coordinator password is printed on the page any visitor could
 * have run it. Replacing the module (rather than guarding the action) is what
 * actually keeps the data out of the server bundle.
 *
 * The signature is unchanged so the registry in
 * src/app/2in1/koordinator/admin/actions.ts still type-checks and the button
 * still appears; pressing it now explains itself instead of inserting anyone.
 */
export async function runSeedSyaikh(log: (s: string) => void): Promise<void> {
  log('Disabled on the demo build: this seed carries production data.');
  throw new Error('Seed disabled on the demo build.');
}
