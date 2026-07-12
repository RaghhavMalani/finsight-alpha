import { useEffect, useState } from "react";

export type InsightJump = {
  label: string;
  onClick: () => void;
  title?: string;
};

export function AiInsight({
  lines,
  jumps,
  source = "AI",
}: {
  lines: string[];
  jumps?: InsightJump[];
  source?: string;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (lines.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % lines.length), 6000);
    return () => clearInterval(id);
  }, [lines.length]);

  return (
    <div className="flex flex-wrap items-center gap-3 border-l-2 border-info bg-info/5 px-3 py-1.5">
      <span className="mono-caps shrink-0 text-[9px] text-info">{source} · INSIGHT</span>
      <span key={idx} className="min-w-0 flex-1 font-mono text-[12px] text-foreground animate-fade-in">
        {lines[idx] ?? lines[0]}
      </span>
      {jumps && jumps.length > 0 && (
        <span className="flex shrink-0 flex-wrap items-center gap-1">
          {jumps.map((j, i) => (
            <button
              key={i}
              onClick={j.onClick}
              title={j.title ?? j.label}
              className="mono-caps interactive border border-info/50 bg-info/10 px-2 py-0.5 text-[9px] text-info transition hover:bg-info hover:text-background"
            >
              → {j.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}

