-- Super admin (owner request, 2026-11-09). Set by the seed from SUPER_ADMIN_EMAILS.
-- A super admin manages console accounts; like every coordinator, they can never list all donors.
create type coordinator_role as enum ('coordinator', 'super_admin');
alter table coordinators add column role coordinator_role not null default 'coordinator';
