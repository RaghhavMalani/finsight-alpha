import { useMemo, useState } from "react";
import { correlationMatrix, viridis } from "@/lib/market";

export function CorrelationMatrix({ symbols }: { symbols: string[] }) {
  const m = useMemo(() => correlationMatrix(symbols), [symbols]);
  const [hover, setHover] = useState<{ i: number; j: number } | null>(null);
  return (
    <div className="flex h-full flex-col p-3">
      <div className="mono-caps mb-3 flex items-center justify-between text-[10px]">
        <span className="text-primary">CORRELATION · 60D ROLLING</span>
        {hover && (
          <span className="text-foreground">
            {symbols[hover.i]} × {symbols[hover.j]} · ρ = {m[hover.i][hover.j].toFixed(2)}
          </span>
        )}
      </div>
      <div className="relative overflow-auto">
        <table className="border-collapse font-mono text-[10px]">
          <thead>
            <tr>
              <th className="p-1" />
              {symbols.map((s) => (
                <th key={s} className="mono-caps p-1 text-[9px] text-muted-foreground">{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.map((row, i) => (
              <tr key={i}>
                <th className="mono-caps p-1 text-[9px] text-muted-foreground text-right">{symbols[i]}</th>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className="h-9 w-9 border border-background text-center transition"
                    style={{
                      background: viridis(v),
                      color: v > 0.55 ? "#050607" : "#E7EAEC",
                      outline: hover && hover.i === i && hover.j === j ? "2px solid #F0A929" : "none",
                    }}
                    onMouseEnter={() => setHover({ i, j })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mono-caps mt-4 flex items-center gap-2 text-[9px] text-faint">
        <span>-1</span>
        <div className="h-2 flex-1" style={{
          background: `linear-gradient(90deg, ${viridis(0)}, ${viridis(0.25)}, ${viridis(0.5)}, ${viridis(0.75)}, ${viridis(1)})`
        }} />
        <span>+1</span>
      </div>
    </div>
  );
}

