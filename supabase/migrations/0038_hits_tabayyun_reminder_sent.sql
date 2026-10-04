-- F3: jam mulai countdown 72h tabayyun. Null = koordinator belum kirim reminder
-- (observasi tersimpan, jam belum jalan). deadline_at di-set = reminder_sent_at + 72h
-- oleh server action saat reminder pertama.
alter table hits_tabayyun add column if not exists reminder_sent_at timestamptz;
