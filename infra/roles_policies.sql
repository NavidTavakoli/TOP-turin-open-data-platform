-- ============================================================
-- Roles & Policies (Safe/Idempotent) for TOP (Supabase/PostgREST)
-- ============================================================

-- 1) Base permissions: allow anon/authenticated to use schema api
grant usage on schema api to anon, authenticated;

-- Allow SELECT on all existing tables in api
grant select on all tables in schema api to anon, authenticated;

-- Default for future tables: automatically grant SELECT to anon/authenticated
alter default privileges in schema api
  grant select on tables to anon, authenticated;

-- 2) Enable RLS on tables (safe; no error if already enabled)
alter table if exists api.air_quality_daily   enable row level security;
alter table if exists api.weather_hourly      enable row level security;
alter table if exists api.transport_stops     enable row level security;
alter table if exists api.osm_places          enable row level security;

-- 3) Create read-only policies, "only if they don’t already exist"
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'air_quality_daily'
      and policyname = 'public read aqd'
  ) then
    create policy "public read aqd"
      on api.air_quality_daily for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'weather_hourly'
      and policyname = 'public read weather'
  ) then
    create policy "public read weather"
      on api.weather_hourly for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'transport_stops'
      and policyname = 'public read stops'
  ) then
    create policy "public read stops"
      on api.transport_stops for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'api' and tablename = 'osm_places'
      and policyname = 'public read places'
  ) then
    create policy "public read places"
      on api.osm_places for select
      using (true);
  end if;
end$$;

