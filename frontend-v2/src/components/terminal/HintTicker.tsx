import { useEffect, useState } from "react";

const HINTS = [
  "Right-click any ticker for actions",
  "Alt + 1-9 jumps between functions",
  "Drag panel edges to resize",
  "Send tickers to group A/B from the watchlist",
  "Wheel over the chart to zoom · double-click to reset",
  "Type NVDA VS AAPL to compare on the same axis",
  "Press ? for the full keyboard map · ⌘K for commands",
];

export function HintTicker() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % HINTS.length), 10_000);
    return () => clearInterval(id);
  }, []);
  return (
    <span
      key={i}
      className="mono-caps text-faint animate-fade-in"
      style={{ animationDuration: "400ms" }}
    >
      TIP · {HINTS[i]}
    </span>
  );
}

