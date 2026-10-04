// env.ts — baca konfigurasi API publik.
// Variable group Azure (`Maahir-Prod`) memakai prefix `ENV_` dan pipeline tidak
// selalu membuang prefix itu sebelum sampai ke proses app. Jadi terima nama
// berprefix (`ENV_PUBLIC_API`) maupun tidak (`PUBLIC_API`) — mana pun yang ada.
export function apiEnv(name: string): string | undefined {
  return process.env[name] ?? process.env[`ENV_${name}`];
}

/** Saklar induk: seluruh /api/v1/* mati (404) kecuali persis "on". */
export function publicApiOn(): boolean {
  return apiEnv('PUBLIC_API') === 'on';
}
