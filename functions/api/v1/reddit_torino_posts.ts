// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
// functions/reddit_torino_posts.ts
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "./_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {
    // Pass through frontend query parameters such as select, order, and limit.
    const url = new URL(ctx.request.url);
    const qs = url.searchParams.toString();

    // If your Supabase table or view uses a different name, change only this value:
    // For example: "reddit_posts" or "vw_reddit_torino_posts".
    const path = `reddit_torino_posts${qs ? `?${qs}` : ""}`;

    // sbFetch comes from _utils.ts and calls PostgREST with Accept-Profile: api.
    const rows = await sbFetch(ctx.env, path);

    return okJSON(rows, { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" });
  } catch (e: any) {
    return errJSON(500, "reddit proxy failed");
  }
};
