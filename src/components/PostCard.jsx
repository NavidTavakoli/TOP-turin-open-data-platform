// THIS IS A DEMO VERSION - Public-safe portfolio build. Do not commit secrets or private production data.
// PostCard.jsx
import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function PostCard({ post }) {
  const [expanded, setExpanded] = useState(false);
  const hasTitle = !!post.title?.trim();
  const hasBody  = !!post.selftext?.trim();

  // Prepare body text; trim only for cleaner display.
  const body = useMemo(() => (post.selftext || "").trim(), [post.selftext]);

  return (
    <article
      className="rounded-xl border border-slate-200/40 dark:border-slate-800/40
                 bg-white/60 dark:bg-slate-950/45 backdrop-blur-sm shadow-sm hover:shadow-md
                 transition-all duration-200"
    >
      {/* Header */}
      <header className="px-4 pt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <time className="block text-[11px] text-slate-500 dark:text-slate-400">
            {formatDate(post.ts)}
          </time>
          {hasTitle && (
            <h3 className="mt-1 text-left text-slate-800 dark:text-slate-100 font-semibold text-[14px] leading-snug break-words">
              {post.title}
            </h3>
          )}
        </div>

        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                       border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80
                       hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium
                       text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white
                       transition-all"
            title="Open on Reddit"
          >
            <span>Open</span>
            <ExternalLink size={10} className="opacity-80" />
          </a>
        )}
      </header>

      {/* Body */}
      <div className="px-4 pb-4 pt-2">
        {hasBody ? (
          <>
            <div
              className={[
                "text-[13px] leading-relaxed text-slate-600 dark:text-slate-300",
                "whitespace-pre-wrap break-words text-left",
                expanded ? "" : "line-clamp-5",
              ].join(" ")}
            >
              {body}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-2 text-xs font-semibold text-indigo-500 dark:text-indigo-400
                         hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          </>
        ) : (
          <div className="text-[12px] text-slate-500 dark:text-slate-500 text-left">
            No body text
          </div>
        )}
      </div>
    </article>
  );
}
