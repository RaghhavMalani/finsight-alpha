import { useEffect, useState } from "react";
import { generateHeadline, seedHeadlines, type Headline } from "@/lib/market";

const CHIP: Record<Headline["sentiment"], { symbol: string; color: string }> = {
  pos: { symbol: "▲", color: "text-up" },
  neg: { symbol: "▼", color: "text-down" },
  neu: { symbol: "◆", color: "text-faint" },
};

export function IntelFeed({
  onSymbolClick,
}: {
  onSymbolClick?: (sym: string) => void;
}) {
  const [items, setItems] = useState<Headline[]>(() => seedHeadlines());
  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => [generateHeadline(), ...prev].slice(0, 20));
    }, 8000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="h-full overflow-y-auto">
      {items.map((h, i) => {
        const chip = CHIP[h.sentiment];
        return (
          <button
            key={h.id}
            onClick={() => onSymbolClick?.(h.sym)}
            className={`block w-full border-b border-divider px-3 py-2 text-left transition hover:bg-raised ${
              i === 0 ? "animate-fade-in bg-primary/5" : ""
            }`}
          >
            <div className="mono-caps flex items-center gap-2 text-[9px] text-faint">
              <span className={`${chip.color}`}>{chip.symbol}</span>
              <span>{h.time}</span>
              <span className="text-primary">{h.sym}</span>
            </div>
            <div className="mt-1 text-[11px] leading-snug text-foreground">{h.text}</div>
          </button>
        );
      })}
    </div>
  );
}

