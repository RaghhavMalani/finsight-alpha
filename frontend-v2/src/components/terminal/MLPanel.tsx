import { useState } from "react";
import { MLSignalsLive } from "./MLSignalsLive";
import { MLRegimesLive } from "./MLRegimesLive";

type Tab = "SIGNALS" | "REGIMES";

export function MLPanel({ symbol }: { symbol: string; book: string[] }) {
  const [tab, setTab] = useState<Tab>("SIGNALS");
  const tabs: Tab[] = ["SIGNALS", "REGIMES"];
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mono-caps flex items-center gap-1 border-b border-divider bg-panel px-3 py-1.5 text-[10px]">
        <span className="mr-2 text-primary">ML · {symbol}</span>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`interactive border px-2 py-1 ${tab === t ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}
          >{t}</button>
        ))}
        <span className="ml-auto text-[9px] text-faint">API · YFINANCE · TRAINED ON DEMAND</span>
      </div>
      <div className="flex-1 overflow-hidden animate-fade-in" key={tab}>
        {tab === "SIGNALS" && <MLSignalsLive symbol={symbol} />}
        {tab === "REGIMES" && <MLRegimesLive symbol={symbol} />}
      </div>
    </div>
  );
}

