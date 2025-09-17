// RedditFeed.jsx
import { useEffect, useState } from "react";
import PostCard from "./PostCard";

export default function RedditFeed({
  API_BASE,
  height = "100%",       
  className = "",        
}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const url =
          `${API_BASE}/api/v1/reddit_torino_posts` +
          `?select=post_id,ts,title,selftext,permalink&order=ts.desc&limit=50`;

        const r = await fetch(url, { headers: { "Accept-Profile": "api" } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();

        if (!cancelled) {
          setPosts(Array.isArray(j) ? j : []);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [API_BASE]);

  return (
    <section
      className={[
        
        "w-full rounded-2xl border border-orange-300",,
        "bg-green-50 dark:bg-green-900/40 shadow-sm p-4 sm:p-6",
        
        "flex flex-col h-full min-h-0",
        className,
      ].join(" ")}
      style={{ height }}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-2 shrink-0">
        <div className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 grid place-items-center font-bold">
          r
        </div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          Reddit Torino <span className="text-slate-500 font-normal">(latest 50 posts)</span>
        </h2>
      </div>

      {/* Scrollable list */}
      <div className="grow min-h-0 overflow-y-auto pr-1 space-y-3">
        {loading ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 animate-pulse">Loading…</div>
        ) : err ? (
          <div className="text-sm text-red-600 dark:text-red-400">Error: {err}</div>
        ) : posts.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400">Nothing to show.</div>
        ) : (
          posts.map((p) => <PostCard key={p.post_id} post={p} />)
        )}
      </div>
    </section>
  );
}
