-- Referrals (owner request 2026-11-10). Non-monetary only: a referral counts once the referred donor has a
-- verified donation, and coordinators may thank the top referrers per city publicly, with their consent.
alter table donors add column referral_code text unique check (referral_code ~ '^R[A-Z0-9]{5}$');
alter table donors add column referred_by uuid references donors(id) on delete set null;
alter table donors add column recognition_consent boolean;       -- null until asked; the donor's own answer
alter table donors add column recognition_asked_at timestamptz;
create index on donors (referred_by) where referred_by is not null;

-- Coordinators cannot list donors (0002). This function is the one narrow exception, approved by the owner:
-- referrers with at least one referred donor who has donated, with first name, nearest city and counts only.
create function referral_leaders()
returns table (donor_id uuid, first_name text, city text, referred int, donated int, consent boolean, asked_at timestamptz)
language sql stable security definer set search_path = public as $$
  with r as (
    select d.referred_by as donor_id, count(*)::int as referred,
           count(*) filter (where exists (select 1 from confirmations c where c.donor_id = d.id and c.verified_at is not null))::int as donated
    from donors d where d.referred_by is not null and d.stopped_at is null
    group by d.referred_by
  )
  select ref.id, split_part(ref.name, ' ', 1), h.city, r.referred, r.donated, ref.recognition_consent, ref.recognition_asked_at
  from r join donors ref on ref.id = r.donor_id and ref.stopped_at is null
  cross join lateral (select city from hospitals order by hospitals.geog <-> ref.home_geog limit 1) h
  where r.donated > 0
$$;
revoke all on function referral_leaders() from public;
grant execute on function referral_leaders() to dhamani_coordinator;
