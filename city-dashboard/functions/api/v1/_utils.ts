export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function okJSON(data: unknown, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json", ...corsHeaders(), ...extra },
  });
}

export function errJSON(status = 500, message = "Internal Server Error") {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders() },
  });
}

export function handlePreflight(request: Request) {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
  return null;
}

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

// مهم: Accept-Profile = 'api' تا ویوهای schema: api دیده شوند
export async function sbFetch(env: Env, path: string) {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "api",
      Prefer: "count=none",
    },
  });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}
