-- The console shows who did what: coordinators may read each other's id and name (never email or password hash).
grant select (id, name) on coordinators to dhamani_coordinator;
create policy coordinator_read_names on coordinators for select to dhamani_coordinator using (true);
