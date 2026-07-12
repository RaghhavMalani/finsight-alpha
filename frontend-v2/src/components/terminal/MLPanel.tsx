import { useState } from "react";
import { MLSignals } from "./MLSignals";
import { MLRegimes } from "./MLRegimes";
import { MLForecast } from "./MLForecast";
import { MLDiscover } from "./MLDiscover";

type Tab = "SIGNALS" | "REGIMES" | "FORECAST" | "DISCOVER";

export function MLPanel({ symbol, book }: { symbol: string; book: string[] }) {
  const [tab, setTab] = useState<Tab>("SIGNALS");
  const tabs: Tab[] = ["SIGNALS", "REGIMES", "FORECAST", "DISCOVER"];
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
        <span className="ml-auto text-[9px] text-faint">HSMM · TFT · ensemble · recommender</span>
      </div>
      <div className="flex-1 overflow-hidden animate-fade-in" key={tab}>
        {tab === "SIGNALS" && <MLSignals symbol={symbol} />}
        {tab === "REGIMES" && <MLRegimes symbol={symbol} />}
        {tab === "FORECAST" && <MLForecast symbol={symbol} />}
        {tab === "DISCOVER" && <MLDiscover book={book} activeSymbol={symbol} />}
      </div>
    </div>
  );
}

