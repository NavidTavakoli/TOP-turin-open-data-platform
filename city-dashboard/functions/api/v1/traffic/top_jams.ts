import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {
    const url = new URL(ctx.request.url);
    const limit = url.searchParams.get("limit") ?? "10";

    // اگر ویو api.vw_traffic_top_jams نداری، این call خطا می‌دهد؛ ما catch می‌کنیم و [] برمی‌گردونیم
    const path = `vw_traffic_top_jams?select=*&limit=${limit}`;
    const items: any[] = await sbFetch(ctx.env, path);

    const n = (v: any) => (v == null || v === "" ? null : Number(v));

    const normalized = items.map((j, i) => ({
      id: j.id ?? i,
      road_name: j.road_name ?? j.name ?? j.segment_id ?? `Jam #${i + 1}`,
      severity: String(j.severity ?? j.level ?? "jam").toLowerCase(),
      length_km: n(j.length_km ?? (j.length_m ? j.length_m / 1000 : null)),
      speed_kmh: n(j.speed_kmh ?? j.avg_speed_kmh),
      delay_min: n(j.delay_min),
      updated_at: j.updated_at ?? j.ts ?? j.window_end,
      center_lat: n(j.center_lat ?? j.lat ?? j.start_lat),
      center_lon: n(j.center_lon ?? j.lon ?? j.start_lon),
    }));

    return okJSON(normalized, { "Cache-Control": "s-maxage=30, stale-while-revalidate=60" });
  } catch (e: any) {
    // فعلاً خالی برگردون تا UI نخوابه
    console.error("top_jams error:", e?.message || e);
    return okJSON([], { "Cache-Control": "s-maxage=5" });
  }
};
