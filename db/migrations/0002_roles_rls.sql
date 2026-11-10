-- PRD 5 "Row-level security", adapted for Neon.
-- The app connects as the table owner (bypasses RLS) and only ever runs on the server.
-- These NOLOGIN roles make the access rules enforceable by Postgres itself:
--   dhamani_anon         the public. No schema access, no table grants: cannot list anything.
--   dhamani_coordinator  console reads run under `set local role dhamani_coordinator` (M7).

do $$
begin
  if not exists (select from pg_roles where rolname = 'dhamani_anon') then
    create role dhamani_anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'dhamani_coordinator') then
    create role dhamani_coordinator nologin;
  end if;
end $$;

-- Allow the app's login role to switch into them.
grant dhamani_anon, dhamani_coordinator to current_user;

-- RLS on every table we own (spatial_ref_sys belongs to PostGIS).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'spatial_ref_sys' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

grant usage on schema public to dhamani_coordinator;
grant select on requests, alerts, confirmations, message_log, audit_log, hospitals, donors to dhamani_coordinator;

create policy coordinator_read on requests      for select to dhamani_coordinator using (true);
create policy coordinator_read on alerts        for select to dhamani_coordinator using (true);
create policy coordinator_read on confirmations for select to dhamani_coordinator using (true);
create policy coordinator_read on message_log   for select to dhamani_coordinator using (true);
create policy coordinator_read on audit_log     for select to dhamani_coordinator using (true);
create policy coordinator_read on hospitals     for select to dhamani_coordinator using (true);

-- A donor row is visible only if that donor has an alert or confirmation on a request.
-- No policy anywhere allows listing all donors.
create policy coordinator_read_involved on donors for select to dhamani_coordinator using (
  exists (select 1 from alerts a where a.donor_id = donors.id)
  or exists (select 1 from confirmations c where c.donor_id = donors.id)
);
