-- M5: rate limiting for reverse-OTP login codes (PRD 13: 5 per IP per 10 min). The IP is stored only as
-- an HMAC (keyed with SESSION_SECRET), never in plain form.
alter table login_codes add column created_at timestamptz not null default now();
alter table login_codes add column ip_hash text;
create index on login_codes (ip_hash, created_at);
create index on web_sessions (wa_id);

-- Wave dispatch and the live request page read alerts and confirmations per request.
create index on alerts (request_id);
create index on confirmations (request_id);
