-- M8 recognition (PRD 11) and the daily job (PRD 12).
-- A donation is verified when the donor said they donated AND the family marked them arrived.
alter table confirmations add column verified_at timestamptz;
alter table confirmations add column certificate_sent_at timestamptz;
create index on confirmations (donor_id) where verified_at is not null;

-- The name printed on certificates, in English letters (owner decision 2026-11-10: pdf-lib cannot lay out
-- Tamil or Telugu, so a donor whose name is in another script is asked once for an English spelling).
alter table donors add column certificate_name text check (certificate_name ~ '^[A-Za-z][A-Za-z .''-]{0,39}$');
-- So the daily job sends eligible_again at most once per interval, even if it runs twice.
alter table donors add column eligible_again_sent_at timestamptz;
