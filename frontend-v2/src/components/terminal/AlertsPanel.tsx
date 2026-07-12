import { useState } from "react";
import type { Instrument } from "@/lib/market";
import { fmt } from "@/lib/market";

export type Alert = {
  id: string;
  sym: string;
  level: number;
  direction: "above" | "below";
  createdAt: number;
  state: "armed" | "triggered";
  triggeredAt?: number;
};

export function AlertsPanel({
  alerts,
  onRemove,
}: {
  alerts: Alert[];
  onRemove: (id: string) => void;
}) {
  if (alerts.length === 0) {
    return (
      <div className="p-4 text-[11px] text-muted-foreground">
        No alerts armed. Click the bell on any ticker to set one.
      </div>
    );
  }
  return (
    <div className="divide-y divide-divider">
      {alerts.map((a) => {
        const on = a.state === "triggered";
        return (
          <div
            key={a.id}
            className={`grid grid-cols-[54px_1fr_auto_auto] items-center gap-2 px-3 py-2 text-left ${
              on ? "bg-primary/5" : ""
            }`}
          >
            <span className="mono-caps text-[11px] text-foreground">{a.sym}</span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {a.direction === "above" ? "≥" : "≤"} {fmt(a.level)}
            </span>
            <span
              className={`mono-caps text-[9px] ${on ? "text-primary" : "text-faint"}`}
            >
              {on ? "TRIGGERED" : "ARMED"}
            </span>
            <button
              onClick={() => onRemove(a.id)}
              className="text-faint hover:text-down"
              title="Remove"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function AlertPopover({
  instrument,
  onClose,
  onSet,
  anchor,
}: {
  instrument: Instrument;
  onClose: () => void;
  onSet: (level: number, direction: "above" | "below") => void;
  anchor?: { x: number; y: number };
}) {
  const [level, setLevel] = useState(instrument.price.toFixed(2));
  const [direction, setDirection] = useState<"above" | "below">("above");
  return (
    <div className="fixed inset-0 z-[105]" onMouseDown={onClose}>
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="absolute w-[260px] border border-border bg-panel p-3 amber-glow animate-fade-in"
        style={{
          left: anchor ? Math.min(window.innerWidth - 280, anchor.x) : "50%",
          top: anchor ? Math.min(window.innerHeight - 200, anchor.y) : "40%",
          transform: anchor ? undefined : "translate(-50%, -50%)",
          borderRadius: 2,
        }}
      >
        <div className="mono-caps mb-2 flex items-center justify-between text-[10px] text-primary">
          <span>ALERT · {instrument.symbol}</span>
          <span className="text-faint">SPOT {fmt(instrument.price)}</span>
        </div>
        <div className="mb-2 flex gap-1">
          {(["above", "below"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`mono-caps flex-1 border px-2 py-1 text-[10px] transition ${
                direction === d
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {d === "above" ? "≥ ABOVE" : "≤ BELOW"}
            </button>
          ))}
        </div>
        <input
          autoFocus
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const n = parseFloat(level);
              if (!isNaN(n)) {
                onSet(n, direction);
                onClose();
              }
            } else if (e.key === "Escape") onClose();
          }}
          className="w-full border border-border bg-background px-2 py-1.5 font-mono text-sm text-foreground outline-none focus:border-primary"
        />
        <div className="mono-caps mt-2 flex items-center justify-between text-[9px] text-faint">
          <span>ENTER · ARM</span>
          <span>ESC · CANCEL</span>
        </div>
      </div>
    </div>
  );
}

