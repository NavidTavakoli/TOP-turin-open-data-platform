// functions/reddit_torino_posts.ts
import { handlePreflight, okJSON, errJSON, sbFetch, type Env } from "./_utils";

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const pre = handlePreflight(ctx.request); if (pre) return pre;

  try {
    // هر querystring که از فرانت بیاد رو پاس می‌دیم (select, order, limit, ...)
    const url = new URL(ctx.request.url);
    const qs = url.searchParams.toString();

    // اگر جدول/ویوی توی Supabase اسمش فرق داره، فقط این اسم رو عوض کن:
    // مثلا "reddit_posts" یا "vw_reddit_torino_posts"
    const path = `reddit_torino_posts${qs ? `?${qs}` : ""}`;

    // sbFetch از _utils.ts میاد و با Accept-Profile: api به PostgREST می‌زنه
    const rows = await sbFetch(ctx.env, path);

    return okJSON(rows, { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" });
  } catch (e: any) {
    return errJSON(500, e.message || "reddit proxy failed");
  }
};
