// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "../_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  // Handle CORS OPTIONS preflight
  const pre = handlePreflight(ctx.request);
  if (pre) return pre;

  try {
    const { searchParams } = new URL(ctx.request.url);
    const code = searchParams.get("code")?.trim() || "";
    const q = searchParams.get("q")?.trim() || "";

    // 1. Input Validation
    if (!code && !q) {
      return errJSON(400, "Missing search parameter: specify either 'code' or 'q'.");
    }

    let queryPath = "gtt_stops?select=stop_id,stop_code,stop_name,stop_lat,stop_lon";

    if (code) {
      // Validate code (should be numeric for GTT stops)
      if (!/^\d+$/.test(code)) {
        return errJSON(400, "Invalid 'code' parameter: must contain only digits.");
      }
      queryPath += `&stop_code=eq.${encodeURIComponent(code)}`;
    } else if (q) {
      // Validate query string (must be at least 2 chars)
      if (q.length < 2) {
        return errJSON(400, "Invalid 'q' parameter: search term must be at least 2 characters long.");
      }
      queryPath += `&stop_name=ilike.*${encodeURIComponent(q)}*&limit=20`;
    }

    // 2. Fetch from Supabase via PostgREST
    const arr = await sbFetch(ctx.env, queryPath);
    const results = Array.isArray(arr) ? arr : [arr];

    // 3. Return response with 1-hour cache header (stops rarely change)
    return okJSON(results, {
      "Cache-Control": "public, max-age=3600, s-maxage=3600"
    });
  } catch (error: any) {
    return errJSON(500, "Failed to query stops database.");
  }
};
