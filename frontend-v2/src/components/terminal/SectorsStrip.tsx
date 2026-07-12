import { useEffect, useState } from "react";

const GICS = [
  "Info Tech",
  "Comms",
  "Cons Discr",
  "Cons Staples",
  "Health Care",
  "Financials",
  "Industrials",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
];

function seed(): number[] {
  // Deterministic bootstrap (avoids SSR/client hydration mismatch); ticks below randomize live.
  return GICS.map((name, i) => {
    let h = 2166136261 ^ i;
    for (let k = 0; k < name.length; k++) { h ^= name.charCodeAt(k); h = (h * 16777619) >>> 0; }
    const r = ((h >>> 0) % 10000) / 10000;
    return (r - 0.5) * 2.4;
  });
}

export function SectorsStrip() {
  const [vals, setVals] = useState<number[]>(() => seed());
  useEffect(() => {
    const id = setInterval(() => {
      setVals((prev) => prev.map((v) => {
        const u = Math.random(), w = Math.random();
        const z = Math.sqrt(-2 * Math.log(Math.max(u, 1e-9))) * Math.cos(2 * Math.PI * w);
        return Math.max(-3.5, Math.min(3.5, v + z * 0.05));
      }));
    }, 2600);
    return () => clearInterval(id);
  }, []);

  const maxAbs = Math.max(1.5, ...vals.map((v) => Math.abs(v)));

  return (
    <div className="divide-y divide-divider">
      {GICS.map((name, i) => {
        const v = vals[i];
        const up = v >= 0;
        const pct = Math.abs(v) / maxAbs;
        return (
          <div
            key={name}
            className="grid grid-cols-[1fr_60px_58px] items-center gap-2 px-3 py-1.5 tabular-nums"
          >
            <span className="truncate text-[10.5px] text-foreground">{name}</span>
            <div className="relative h-1 bg-background">
              <div
                className={`absolute top-0 h-full ${up ? "bg-up/70" : "bg-down/70"}`}
                style={{
                  left: up ? "50%" : `${50 - pct * 50}%`,
                  width: `${pct * 50}%`,
                  transition: "all 500ms cubic-bezier(0.16,1,0.3,1)",
                }}
              />
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
            </div>
            <span className={`text-right font-mono text-[10px] tabular-nums ${up ? "text-up" : "text-down"}`}>
              {up ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

