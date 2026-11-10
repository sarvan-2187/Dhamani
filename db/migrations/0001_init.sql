-- PRD section 5, adapted for Neon (no Supabase auth or storage).
-- Deviations: coordinators carry their own email + scrypt hash; slips live in request_slips (bytea);
-- hospitals unique on (name, city) so the seed is re-runnable. pg_cron / pg_net: decided in M6.

create extension if not exists postgis;

create type abo as enum ('A','B','AB','O');
create type rh as enum ('pos','neg');
create type component as enum ('whole_blood','prbc','platelets_rdp','platelets_sdp','ffp');
create type sex as enum ('male','female','other');
create type weight_band as enum ('45_54','55_plus');
create type lang as enum ('en','ta','te');
create type trust_level as enum ('unverified','slip_verified','coordinator_verified');
create type request_status as enum ('open','fulfilled','expired','cancelled','frozen','held');
create type alert_response as enum ('donate','not_now','pause','deferred','none');

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  blood_centre_licence text,
  address text not null,
  city text not null,
  geog geography(Point,4326) not null,
  eraktkosh_url text,
  has_apheresis boolean not null default false,
  unique (name, city)
);
create index on hospitals using gist (geog);

create table donors (
  id uuid primary key default gen_random_uuid(),
  wa_id text unique not null,              -- E.164 without +, from WhatsApp
  name text not null,
  lang lang not null default 'en',
  abo abo,                                 -- null when is_bombay
  rh rh,
  is_bombay boolean not null default false,
  dob date not null,
  sex sex not null,
  weight_band weight_band not null,
  home_geog geography(Point,4326) not null, -- rounded to ~500 m before insert
  radius_km int not null default 10 check (radius_km in (5,10,20)),
  last_donated_on date,
  paused_until timestamptz,
  night_ok boolean not null default false,
  rare_registry_opt_in boolean not null default false,
  responsiveness numeric not null default 0.5,
  last_alerted_at timestamptz,
  consent_version text not null,
  stopped_at timestamptz,
  is_synthetic boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_bombay = (abo is null and rh is null))
);
create index on donors using gist (home_geog);

create table requests (
  id uuid primary key default gen_random_uuid(),
  public_slug text unique not null,        -- 8 chars, URL safe
  requester_wa_id text not null,
  hospital_id uuid not null references hospitals(id),
  patient_label text,                      -- first name + initial only; nulled 30 days after close
  abo abo,
  rh rh,
  is_bombay boolean not null default false,
  component component not null,
  units int not null check (units between 1 and 10),
  needed_by timestamptz not null,
  is_critical boolean not null default false,
  trust_level trust_level not null default 'unverified',
  status request_status not null default 'open',
  current_wave int not null default 0,
  next_check_at timestamptz,
  last_status_ping_at timestamptz,
  awaiting_still_needed_since timestamptz,
  expires_at timestamptz not null,
  slip_verified_at timestamptz,
  report_count int not null default 0,
  escalated boolean not null default false,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check (is_bombay = (abo is null and rh is null))
);
create index on requests (status, next_check_at);
create index on requests (requester_wa_id) where status = 'open';

-- Replaces Supabase Storage bucket `slips` (private). Deleted 7 days after verification.
create table request_slips (
  request_id uuid primary key references requests(id) on delete cascade,
  content bytea not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  uploaded_at timestamptz not null default now()
);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  donor_id uuid not null references donors(id) on delete cascade,
  wave int not null,
  sent_at timestamptz not null default now(),
  response alert_response not null default 'none',
  responded_at timestamptz,
  unique (request_id, donor_id)
);
create index on alerts (donor_id, sent_at);   -- 7 and 30 day alert caps

create table confirmations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  donor_id uuid not null references donors(id) on delete cascade,
  eta_bucket text check (eta_bucket in ('lt30','30to60','gt60')),
  donor_said_donated boolean,              -- from follow-up
  requester_marked_arrived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (request_id, donor_id)
);
create index on confirmations (donor_id);
-- verified donation = donor_said_donated AND requester_marked_arrived

create table wa_conversations (             -- per-number chat state machine
  wa_id text primary key,
  flow text,                               -- 'onboarding' | 'deferral' | 'eta' | null
  step text,
  data jsonb not null default '{}',
  window_open_until timestamptz,           -- last inbound + 24 h
  updated_at timestamptz not null default now()
);

create table login_codes (
  code text primary key,                   -- e.g. 'DH-4821-7Q'
  web_nonce text not null,
  wa_id text,
  expires_at timestamptz not null,
  confirmed_at timestamptz
);

create table web_sessions (
  id uuid primary key default gen_random_uuid(),
  wa_id text not null,
  expires_at timestamptz not null
);

create table message_log (                  -- every outbound and inbound message, real or simulated
  id bigserial primary key,
  direction text not null check (direction in ('out','in')),
  wa_id text not null,
  channel text not null check (channel in ('whatsapp','simulated')),
  kind text not null,                      -- template name or message type
  body jsonb not null,
  request_id uuid references requests(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on message_log (request_id, created_at);

create table audit_log (
  id bigserial primary key,
  actor text not null,                     -- coordinator id, 'system', or wa_id
  action text not null,
  request_id uuid,
  at timestamptz not null default now()
);

-- Replaces Supabase Auth: accounts created by seed only, no sign-up.
create table coordinators (
  id uuid primary key default gen_random_uuid(),
  email text unique not null check (email = lower(email)),
  name text not null,
  password_hash text not null,             -- scrypt, see lib/auth/password.ts
  created_at timestamptz not null default now()
);
