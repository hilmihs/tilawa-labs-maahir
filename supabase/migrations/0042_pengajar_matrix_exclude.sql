-- Flag pengajar yang dinilai lewat observasi (mis. guru DPQ) TAPI tidak masuk
-- Matrix Skill Guru: sistem laporan observasi (pedagogis dll) tetap jalan,
-- hanya compute + dashboard matrix yang mengecualikan mereka.
alter table pengajar
  add column if not exists matrix_exclude boolean not null default false;

comment on column pengajar.matrix_exclude is
  'true = dikecualikan dari Matrix Skill Guru (compute & dashboard). Observasi/pedagogis tetap berjalan.';
