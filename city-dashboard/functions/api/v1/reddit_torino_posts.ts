// functions/reddit_torino_posts.ts
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "./_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {

    const url = new URL(ctx.request.url);
    const qs = url.searchParams.toString();


    const path = `reddit_torino_posts${qs ? `?${qs}` : ""}`;


    const rows = await sbFetch(ctx.env, path);

    return okJSON(rows, { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" });
  } catch (e: any) {
    return errJSON(500, e.message || "reddit proxy failed");
  }
};
