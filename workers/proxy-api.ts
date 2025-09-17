// Proxy for public reads without exposing the anon key
// ENV:
//  - POSTGREST_PUBLIC_URL (Supabase REST endpoint)
//  - ANON_KEY

interface Env { POSTGREST_PUBLIC_URL: string; ANON_KEY: string; }

export default {
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    // Example path: /api/turin/air_quality_daily?city=eq.Turin
    if (url.pathname.startsWith("/api/")) {
      const upstream = env.POSTGREST_PUBLIC_URL + url.pathname.replace("/api", "");
      const u = new URL(upstream);
      u.search = url.search;
      const r = await fetch(u.toString(), {
        headers: {
          "apikey": env.ANON_KEY,
          "Authorization": `Bearer ${env.ANON_KEY}`
        }
      });
      return new Response(r.body, { status: r.status, headers: { "Content-Type": r.headers.get("Content-Type") || "application/json" }});
    }
    return new Response("TOP proxy running");
  }
} satisfies ExportedHandler;
