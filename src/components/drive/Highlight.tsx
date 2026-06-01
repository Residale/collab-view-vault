import { useMemo } from "react";

/** Splits `text` on case-insensitive occurrences of `query` and wraps matches in <mark>. */
export function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query?: string | null;
  className?: string;
}) {
  const parts = useMemo(() => {
    if (!query || !query.trim()) return [{ t: text, m: false }];
    const q = query.trim();
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return text.split(re).map((t, i) => ({ t, m: i % 2 === 1 }));
  }, [text, query]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.m ? (
          <mark
            key={i}
            className="bg-yellow-300/70 text-foreground rounded-sm px-0.5 underline decoration-yellow-500 underline-offset-2"
          >
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </span>
  );
}
