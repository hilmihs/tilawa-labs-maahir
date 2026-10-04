export function scaleKehadiran(persen: number): 0 | 1 | 2 | 3 | 4 {
  if (persen >= 80) return 4;
  if (persen >= 61) return 3;
  if (persen >= 41) return 2;
  if (persen >= 21) return 1;
  return 0;
}

export function scaleBacaan(points: number): 0 | 1 | 2 | 3 | 4 {
  if (points >= 86) return 4;
  if (points >= 70) return 3;
  if (points >= 47) return 2;
  if (points >= 24) return 1;
  return 0;
}

export function scaleHafalan(juz: number): 0 | 1 | 2 | 3 | 4 {
  if (juz >= 21) return 4;
  if (juz >= 16) return 3;
  if (juz >= 11) return 2;
  if (juz >= 5) return 1;
  return 0;
}

export function scaleByTeguranCount(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 4;
  if (count === 1) return 3;
  if (count === 2) return 2;
  if (count === 3) return 1;
  return 0;
}

export function scaleKomitmenJadwal(changes: number): 0 | 1 | 2 | 3 | 4 {
  if (changes <= 4) return 4;
  if (changes <= 6) return 3;
  if (changes <= 8) return 2;
  if (changes <= 10) return 1;
  return 0;
}

export function scaleSopCompliance(persen: number): 0 | 1 | 2 | 3 | 4 {
  if (persen >= 80) return 4;
  if (persen >= 61) return 3;
  if (persen >= 41) return 2;
  if (persen >= 21) return 1;
  return 0;
}
