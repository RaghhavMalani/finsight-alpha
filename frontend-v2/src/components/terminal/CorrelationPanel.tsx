import { useState } from "react";
import { CorrelationMatrix } from "./CorrelationMatrix";
import { CorrelationWeb } from "./CorrelationWeb";
import { DependenciesGraph } from "./DependenciesGraph";
import { DependencyImpact } from "./DependencyImpact";

type Mode = "heatmap" | "web" | "deps" | "impact";

export function CorrelationPanel({
  symbols,
  activeSymbol,
  onFocus,
}: {
  symbols: string[];
  activeSymbol?: string;
  onFocus?: (sym: string) => void;
}) {
  const [mode, setMode] = useState<Mode>("deps");
  return (
    <div className="flex h-full flex-col">
      <div className="mono-caps flex items-center justify-end gap-1 border-b border-divider bg-panel px-3 py-1.5 text-[9px]">
        {(["heatmap", "web", "deps", "impact"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`interactive border px-1.5 py-1 ${mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}
          >
            {m === "heatmap" ? "MATRIX" : m === "web" ? "WEB" : m === "deps" ? "DEPENDENCIES" : "IMPACT"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden animate-fade-in" key={mode}>
        {mode === "heatmap" && <CorrelationMatrix symbols={symbols} />}
        {mode === "web" && <CorrelationWeb symbols={symbols} onFocus={onFocus} />}
        {mode === "deps" && <DependenciesGraph symbol={activeSymbol ?? symbols[0]} onFocus={onFocus} />}
        {mode === "impact" && <DependencyImpact symbol={activeSymbol ?? symbols[0]} onBack={() => setMode("deps")} />}
      </div>
    </div>
  );
}

