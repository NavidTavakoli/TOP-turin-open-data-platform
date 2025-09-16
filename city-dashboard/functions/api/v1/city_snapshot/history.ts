import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {
    const url = new URL(ctx.request.url);
    const hours = Math.max(1, Math.min(168, Number(url.searchParams.get("hours") || "24"))); // 1..168
    const sinceISO = new Date(Date.now() - hours * 3600 * 1000).toISOString();

    // از اسکیمای api می‌خوانیم (sbFetch خودش Accept-Profile: api می‌فرستد)
    const [weather, traffic] = await Promise.all([
      sbFetch(ctx.env,
        `weather_current?select=ts,temperature_c,relative_humidity,apparent_temperature,wind_speed_ms,precipitation_mm,cloud_cover&ts=gte.${encodeURIComponent(sinceISO)}&order=ts.asc`
      ),
      sbFetch(ctx.env,
        `vw_traffic_city_summary?select=window_end,avg_speed_kmh,segments,free_cnt,moderate_cnt,busy_cnt,heavy_cnt,jam_cnt&window_end=gte.${encodeURIComponent(sinceISO)}&order=window_end.asc`
      ),
    ]);

    // گروه‌بندی به ازای هر ساعت
    const bin = (d: string) => {
      const x = new Date(d); x.setMinutes(0, 0, 0); return x.toISOString();
    };

    const byHour = new Map<string, any>();

    for (const w of (weather as any[])) {
      const k = bin(w.ts);
      const r = byHour.get(k) || { bucket: k };
      r.weather_ts = w.ts;
      r.temp_c = w.temperature_c == null ? null : Number(w.temperature_c);
      r.humidity = w.relative_humidity == null ? null : Number(w.relative_humidity);
      r.apparent_c = w.apparent_temperature == null ? null : Number(w.apparent_temperature);
      r.wind_ms = w.wind_speed_ms == null ? null : Number(w.wind_speed_ms);
      r.precip_mm = w.precipitation_mm == null ? null : Number(w.precipitation_mm);
      r.cloud_cover = w.cloud_cover == null ? null : Number(w.cloud_cover);
      byHour.set(k, r);
    }

    for (const t of (traffic as any[])) {
      const k = bin(t.window_end);
      const r = byHour.get(k) || { bucket: k };
      r.traffic_ts = t.window_end;
      r.avg_speed_kmh = t.avg_speed_kmh == null ? null : Number(t.avg_speed_kmh);
      r.segments = t.segments == null ? null : Number(t.segments);
      r.free_cnt = t.free_cnt == null ? null : Number(t.free_cnt);
      r.moderate_cnt = t.moderate_cnt == null ? null : Number(t.moderate_cnt);
      r.busy_cnt = t.busy_cnt == null ? null : Number(t.busy_cnt);
      r.heavy_cnt = t.heavy_cnt == null ? null : Number(t.heavy_cnt);
      r.jam_cnt = t.jam_cnt == null ? null : Number(t.jam_cnt);
      byHour.set(k, r);
    }

    const items = Array.from(byHour.values()).sort((a, b) => a.bucket.localeCompare(b.bucket));
    return okJSON(items, { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" });
  } catch (e: any) {
    return errJSON(500, e.message || "history failed");
  }
};
