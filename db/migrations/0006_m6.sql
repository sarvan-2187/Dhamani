-- M6: send each donor's "Were you able to donate?" follow-up once (PRD 12), and remember the requester's
-- language for the 6-hourly status ping (requesters need not be donors, so the donors table has no row for them).
alter table confirmations add column followup_sent_at timestamptz;
alter table requests add column lang lang not null default 'en';
