create schema if not exists api;

-- Air quality (daily)
create table if not exists api.air_quality_daily (
  city text not null,
  station_id text not null,
  ts date not null,
  pm25 numeric,
  no2 numeric,
  o3 numeric,
  aqi int,
  lat double precision,
  lon double precision,
  primary key (city, station_id, ts)
);
create index if not exists idx_aqd_city_ts on api.air_quality_daily(city, ts);
create index if not exists idx_aqd_geom on api.air_quality_daily using gist (point(lon, lat));

-- Weather (Hourly)
create table if not exists api.weather_hourly (
  city text not null,
  ts timestamptz not null,
  temp_c numeric,
  wind_ms numeric,
  precip_mm numeric,
  humidity numeric,
  lat double precision,
  lon double precision,
  primary key (city, ts)
);
create index if not exists idx_wh_city_ts on api.weather_hourly(city, ts);

-- Transport stops
create table if not exists api.transport_stops (
  stop_id text primary key,
  name text,
  type text,
  lat double precision,
  lon double precision,
  zone text,
  lines text[]
);
create index if not exists idx_ts_type on api.transport_stops(type);

-- OSM places (flexible with jsonb)
create table if not exists api.osm_places (
  osm_id text primary key,
  name text,
  category text,
  lat double precision,
  lon double precision,
  meta_jsonb jsonb
);
create index if not exists idx_op_cat on api.osm_places(category);
create index if not exists idx_op_meta_gin on api.osm_places using gin (meta_jsonb);

-- Sample analytical view: nearest transport station to AQ
-- (Approximation: simple join using minimum distance)
create or replace view api.vw_env_join as
with aq as (
  select city, station_id, ts, aqi, lat as aq_lat, lon as aq_lon from api.air_quality_daily
),
nearest as (
  select a.city, a.station_id, a.ts, a.aqi,
         t.stop_id, t.name as stop_name, t.type as stop_type,
         t.lat as stop_lat, t.lon as stop_lon,
         ( (a.aq_lat - t.lat)^2 + (a.aq_lon - t.lon)^2 ) as dist2
  from aq a
  join api.transport_stops t on true
)
select * from (
  select *, row_number() over (partition by city, station_id, ts order by dist2 asc) as rn
  from nearest
) z where rn = 1;
