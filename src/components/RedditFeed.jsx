// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
// RedditFeed.jsx
import { useEffect, useState } from "react";
import PostCard from "./PostCard";

export default function RedditFeed({
  API_BASE,
  height = "100%",       // Use 100% to fill the parent grid cell.
  className = "",        // Extra classes passed from the parent.
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
        "card-neon w-full rounded-2xl border border-slate-200/60 dark:border-slate-800/60",
        "bg-white/65 dark:bg-slate-900/60 backdrop-blur-md",
        "shadow-[0_1px_1px_rgba(0,0,0,.04),0_10px_30px_rgba(2,6,23,.10)]",
        "transition-all duration-200 p-4 sm:p-5",
        "flex flex-col h-full min-h-0",
        className,
      ].join(" ")}
      style={{ height }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="icon-neon inline-flex items-center justify-center w-7 h-7 rounded-xl
                           bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700">
            <span className="text-xs font-black text-slate-700 dark:text-slate-200">r/</span>
          </span>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Reddit Torino <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(latest 50 posts)</span>
          </h2>
        </div>
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
