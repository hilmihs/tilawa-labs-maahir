-- F3 hardening: cegah teguran ganda untuk sumber yang sama (mis. dua koordinator
-- klik "Teguran ghosting" berbarengan → TOCTOU pada cek `if (existing) return`).
-- Menjadikan idempotensi issueTeguranForTabayyun jaminan DB, bukan best-effort.
-- Juga melindungi jalur decideTabayyun lama. Parsial: hanya baris dgn source_ref_id.
create unique index if not exists hits_teguran_source_unique
  on hits_teguran (source_ref_type, source_ref_id)
  where source_ref_id is not null;
