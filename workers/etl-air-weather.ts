// Cloudflare Worker with Scheduled Cron
// Secrets needed (via `wrangler secret put`):
//  - POSTGREST_URL (e.g., https://jlnnyqakpounimmnflee.supabase.co/rest/v1)
//  - SERVICE_KEY   (Supabase service_role key or JWT with insert rights)
//  - CITY          (e.g., "Turin")
//  - AQ_STATION_ID (optional default)
//  - CITY_LAT, CITY_LON (for weather grid)

interface Env {
  POSTGREST_URL: string;
  SERVICE_KEY: string;
  CITY: string;
  AQ_STATION_ID?: string;
  CITY_LAT: string;
  CITY_LON: string;
}

const headers = (env: Env) => ({
  "apikey": env.SERVICE_KEY,              // Supabase requires apikey header
  "Authorization": `Bearer ${env.SERVICE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "resolution=merge-duplicates" // Upsert
});

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    await runETL(env);
  },
  async fetch(req: Request, env: Env) {
    // manual trigger
    const url = new URL(req.url);
    if (url.pathname === "/run") {
      const res = await runETL(env);
      return new Response(JSON.stringify(res, null, 2), { headers: { "Content-Type": "application/json" }});
    }
    return new Response("OK");
  }
} satisfies ExportedHandler<Env>;

async function runETL(env: Env) {
  const city = env.CITY || "Turin";
  const lat = parseFloat(env.CITY_LAT);
  const lon = parseFloat(env.CITY_LON);

  // 1) Fetch Air Quality (OpenAQ example)
  const since = new Date(Date.now() - 1000*60*60*24*7).toISOString(); // last 7 days
  const aqUrl = `https://api.openaq.org/v2/measurements?city=${encodeURIComponent(city)}&date_from=${since}&limit=1000`;
  const aq = await (await fetch(aqUrl)).json();

  // normalize to daily aggregates (pm25, no2, o3, aqi naive)
  const daily: Record<string, {pm25?: number; no2?: number; o3?: number; lat?: number; lon?: number; count:number}> = {};
  for (const m of aq.results || []) {
    const day = (m.date?.utc || "").slice(0,10);
    const key = `${day}`;
    if (!daily[key]) daily[key] = {count:0};
    const v = Number(m.value);
    if (m.parameter === "pm25") daily[key].pm25 = avg(daily[key].pm25, v);
    if (m.parameter === "no2")  daily[key].no2  = avg(daily[key].no2, v);
    if (m.parameter === "o3")   daily[key].o3   = avg(daily[key].o3, v);
    if (m.coordinates) { daily[key].lat = m.coordinates.latitude; daily[key].lon = m.coordinates.longitude; }
    daily[key].count++;
  }
  const aqRows = Object.entries(daily).map(([day, v]) => ({
    city, station_id: env.AQ_STATION_ID || "openaq",
    ts: day,
    pm25: v.pm25 ?? null,
    no2: v.no2 ?? null,
    o3: v.o3 ?? null,
    aqi: computeAQI(v.pm25, v.no2, v.o3),
    lat: v.lat ?? lat,
    lon: v.lon ?? lon
  }));

  // 2) Fetch Weather (Open-Meteo)
  const start = new Date(Date.now() - 1000*60*60*24*7).toISOString();
  const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&past_hours=168`;
  const w = await (await fetch(wUrl)).json();
  const times: string[] = w.hourly?.time || [];
  const weatherRows = times.map((t: string, i: number) => ({
    city,
    ts: new Date(t).toISOString(),
    temp_c: num(w.hourly.temperature_2m?.[i]),
    wind_ms: msFromKph(num(w.hourly.wind_speed_10m?.[i])),
    precip_mm: num(w.hourly.precipitation?.[i]),
    humidity: num(w.hourly.relative_humidity_2m?.[i]),
    lat, lon
  }));

  // 3) Upsert via PostgREST
  const aqRes = await fetch(`${env.POSTGREST_URL}/air_quality_daily`, {
    method: "POST", headers: headers(env), body: JSON.stringify(aqRows)
  });
  const wRes = await fetch(`${env.POSTGREST_URL}/weather_hourly`, {
    method: "POST", headers: headers(env), body: JSON.stringify(weatherRows)
  });

  return {
    air_quality_upsert_status: aqRes.status,
    weather_upsert_status: wRes.status,
    aq_rows: aqRows.length,
    weather_rows: weatherRows.length
  };
}

function avg(a?: number, b?: number) { if (a == null) return b; if (b == null) return a; return (a+b)/2; }
function num(x: any) { const n = Number(x); return isFinite(n) ? n : null; }
function msFromKph(x?: number | null) { return x==null? null: x/3.6; }
function computeAQI(pm25?: number, no2?: number, o3?: number) {
  // very naive placeholder index 0-500
  const scores = [pm25, no2, o3].filter(v => v!=null).map(v => Number(v));
  if (!scores.length) return null;
  const s = Math.max(...scores);
  return Math.round(Math.min(500, s*10));
}
