-- M7 coordinator console (PRD 10.5, 8.3).
-- Sessions live in the database so disabling an account or signing out ends them at once.
alter table coordinators add column disabled_at timestamptz;

create table console_sessions (
  id uuid primary key default gen_random_uuid(),
  coordinator_id uuid not null references coordinators(id) on delete cascade,
  expires_at timestamptz not null
);
alter table console_sessions enable row level security; -- no grants: owner only

-- Coordinators review slips (PRD 10.5). Still read-only, still no donor listing.
grant select on request_slips to dhamani_coordinator;
create policy coordinator_read on request_slips for select to dhamani_coordinator using (true);

create index on audit_log (request_id, at);
create index on audit_log (at);
