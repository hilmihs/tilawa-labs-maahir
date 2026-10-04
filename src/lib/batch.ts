export function getCurrentPekan(batchStartDate: string): number {
  const start = new Date(batchStartDate + 'T00:00:00+07:00');
  const now = new Date(
    new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }) + '+07:00'
  );
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

export function isElectionPeriod(batchStartDate: string): boolean {
  const pekan = getCurrentPekan(batchStartDate);
  return pekan >= 1 && pekan <= 2;
}
