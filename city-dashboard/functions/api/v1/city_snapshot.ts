import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "./_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {

    const arr = await sbFetch(ctx.env, "vw_city_snapshot?select=*&order=weather_ts.desc&limit=1");
    const raw = Array.isArray(arr) ? arr[0] : arr;

    const num = (v: any) => (v == null || v === "" ? null : Number(v));

    const body = {
      weather_ts: raw.weather_ts,
      temp_c: num(raw.temp_c ?? raw.temperature_c),
      wind_ms: num(raw.wind_ms ?? raw.wind_speed_ms),
      precip_mm: num(raw.precip_mm ?? raw.precipitation_mm),
      humidity: num(raw.humidity ?? raw.relative_humidity),
      cloud_cover: num(raw.cloud_cover),

      air_ts: raw.air_ts,
      station_id: raw.station_id,
      aqi: num(raw.aqi),
      pm25: num(raw.pm25),
      no2: num(raw.no2),
      o3: num(raw.o3),

      traffic_ts: raw.traffic_ts ?? raw.window_end,
      segments: num(raw.segments),
      free_cnt: num(raw.free_cnt),
      moderate_cnt: num(raw.moderate_cnt),
      busy_cnt: num(raw.busy_cnt),
      heavy_cnt: num(raw.heavy_cnt),
      jam_cnt: num(raw.jam_cnt),
      avg_speed_kmh: num(raw.avg_speed_kmh),
    };

    return okJSON(body, { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" });
  } catch (e: any) {
    return errJSON(500, e.message || "snapshot failed");
  }
};
