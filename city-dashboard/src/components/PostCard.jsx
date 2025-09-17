// PostCard.jsx
import { useMemo, useState } from "react";

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


  const body = useMemo(() => (post.selftext || "").trim(), [post.selftext]);

  return (
    <article
      className="rounded-2xl border border-slate-200/70 dark:border-slate-700/60
                 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md
                 transition-shadow duration-200"
    >
      {/* Header */}
      <header className="px-4 sm:px-5 pt-4 sm:pt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <time className="block text-xs text-slate-500 dark:text-slate-400">
            {formatDate(post.ts)}
          </time>
          {hasTitle && (
            <h3 className="mt-1 text-left text-slate-900 dark:text-white font-semibold leading-snug break-words">
              {post.title}
            </h3>
          )}
        </div>

        {post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-2 rounded-full
                       border border-slate-300/70 dark:border-slate-600
                       px-3 py-1 text-xs text-slate-700 dark:text-slate-200
                       hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Open on Reddit"
          >
            Open on Reddit
          </a>
        )}
      </header>

      {/* Body */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">
        {hasBody ? (
          <>
            <div
              className={[
                "text-[13px] leading-relaxed text-slate-700 dark:text-slate-300",
                "whitespace-pre-wrap break-words text-left",
                expanded ? "" : "line-clamp-5",
              ].join(" ")}
            >
              {body}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="mt-2 text-xs text-slate-600 dark:text-slate-300
                         hover:text-slate-900 dark:hover:text-white underline underline-offset-4"
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          </>
        ) : (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            No body text
          </div>
        )}
      </div>
    </article>
  );
}
