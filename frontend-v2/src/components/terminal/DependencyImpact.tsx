import { useMemo, useState } from "react";
import { elasticitiesFor, propagateShock } from "@/lib/elasticity";
import { depsOf, DEP_COLOR, DEP_LABEL } from "@/lib/dependencies";
import { fmt } from "@/lib/market";
import { toast } from "sonner";

type Sub = "IMPACT" | "SHOCK";

export function DependencyImpact({ symbol, onBack }: { symbol: string; onBack: () => void }) {
  const [sub, setSub] = useState<Sub>("IMPACT");
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="mono-caps flex items-center gap-1 border-b border-divider bg-panel px-3 py-1.5 text-[9px]">
        <button onClick={onBack} className="interactive border border-border px-1.5 py-1 text-faint hover:text-foreground">← GRAPH</button>
        <span className="mx-2 text-primary">IMPACT MODEL · {symbol}</span>
        {(["IMPACT", "SHOCK"] as Sub[]).map((k) => (
          <button key={k} onClick={() => setSub(k)}
            className={`interactive border px-1.5 py-1 ${sub === k ? "border-primary bg-primary/10 text-primary" : "border-border text-faint hover:text-foreground"}`}>
            {k === "IMPACT" ? "ELASTICITIES" : "SHOCK SIMULATOR"}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden animate-fade-in" key={sub}>
        {sub === "IMPACT" ? <ElasticityTable symbol={symbol} /> : <ShockSimulator symbol={symbol} />}
      </div>
    </div>
  );
}

function ElasticityTable({ symbol }: { symbol: string }) {
  const els = useMemo(() => elasticitiesFor(symbol), [symbol]);
  if (els.length === 0) {
    return <div className="mono-caps flex h-full items-center justify-center text-[10px] text-faint">No curated dependencies for {symbol}.</div>;
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mono-caps sticky top-0 grid items-center gap-2 border-b border-divider bg-panel px-3 py-1.5 text-[9px] text-faint"
        style={{ gridTemplateColumns: "70px 90px 100px 60px 60px 1fr" }}>
        <span>NODE</span><span>TYPE</span><span>ELASTICITY</span><span>LAG</span><span>HIT %</span><span className="text-center">SCATTER · β</span>
      </div>
      {els.map((el) => {
        const beta = el.beta;
        const color = beta >= 0 ? "text-up" : "text-down";
        return (
          <div key={el.dep.id} className="grid items-center gap-2 border-b border-divider/40 px-3 py-2 hover:bg-raised"
            style={{ gridTemplateColumns: "70px 90px 100px 60px 60px 1fr" }}>
            <span className="mono-caps text-[10px] text-primary">{el.dep.id}</span>
            <span className="mono-caps flex items-center gap-1 text-[9px] text-faint">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DEP_COLOR[el.dep.type] }} />
              {DEP_LABEL[el.dep.type]}
            </span>
            <span className={`font-mono text-[11px] tabular-nums ${color}`}>
              +1% → {beta >= 0 ? "+" : ""}{beta.toFixed(2)}%
            </span>
            <span className="mono-caps text-[10px] text-foreground">t+{el.lag}</span>
            <span className="mono-caps text-[10px] text-foreground">{(el.hitRate * 100).toFixed(0)}%</span>
            <div className="pl-2"><Scatter data={el.scatter} beta={beta} /></div>
          </div>
        );
      })}
      <div className="mono-caps border-t border-primary/40 bg-primary/5 px-3 py-2 text-[9px] text-primary">
        Elasticity is measured on same-day % returns; positive = moves same direction as {symbol}.
      </div>
    </div>
  );
}

function Scatter({ data, beta }: { data: { x: number; y: number }[]; beta: number }) {
  const W = 200, H = 60, PAD = 4;
  const xs = data.map((p) => p.x); const ys = data.map((p) => p.y);
  const xMax = Math.max(3, ...xs.map(Math.abs));
  const yMax = Math.max(3, ...ys.map(Math.abs));
  const xAt = (v: number) => W / 2 + (v / xMax) * (W / 2 - PAD);
  const yAt = (v: number) => H / 2 - (v / yMax) * (H / 2 - PAD);
  const lx1 = -xMax, lx2 = xMax;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none">
      <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#171B1F" strokeWidth={0.5} />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="#171B1F" strokeWidth={0.5} />
      {data.map((p, i) => <circle key={i} cx={xAt(p.x)} cy={yAt(p.y)} r={0.9} fill="#9AA2A9" opacity={0.55} />)}
      <line x1={xAt(lx1)} y1={yAt(beta * lx1)} x2={xAt(lx2)} y2={yAt(beta * lx2)} stroke="#F0A929" strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ShockSimulator({ symbol }: { symbol: string }) {
  const deps = useMemo(() => depsOf(symbol), [symbol]);
  const nodes = useMemo(() => [symbol, ...deps.map((d) => d.id)], [symbol, deps]);
  const [target, setTarget] = useState(deps[0]?.id ?? symbol);
  const [shock, setShock] = useState(-5);
  const [running, setRunning] = useState(false);
  const [pulse, setPulse] = useState(0);
  const [result, setResult] = useState<Record<string, { impact: number; conf: number }> | null>(null);

  function propagate() {
    setRunning(true);
    setResult(null);
    setPulse((n) => n + 1);
    setTimeout(() => {
      const r = propagateShock(symbol, target, shock);
      setResult(r);
      setRunning(false);
      toast.success(`Shock propagated · ${Object.keys(r).length} nodes`);
    }, 900);
  }

  const focusImpact = result?.[symbol];

  return (
    <div className="grid h-full grid-cols-[1fr_320px] overflow-hidden">
      <StarGraph symbol={symbol} deps={deps} target={target} onTarget={setTarget} result={result} pulseKey={pulse} />

      <div className="flex flex-col gap-3 border-l border-divider bg-panel/40 p-4 overflow-y-auto">
        <div>
          <div className="mono-caps text-[10px] text-primary">SHOCK NODE</div>
          <select value={target} onChange={(e) => { setTarget(e.target.value); setResult(null); }}
            className="interactive mt-1 w-full border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground">
            {nodes.map((n) => <option key={n} value={n}>{n}{n === symbol ? " (focus)" : ""}</option>)}
          </select>
        </div>
        <div>
          <div className="mono-caps flex justify-between text-[10px] text-primary">
            <span>SHOCK MAGNITUDE</span>
            <span className={shock >= 0 ? "text-up" : "text-down"}>{shock >= 0 ? "+" : ""}{shock.toFixed(1)}%</span>
          </div>
          <input type="range" min={-10} max={10} step={0.5} value={shock} onChange={(e) => { setShock(Number(e.target.value)); setResult(null); }}
            className="mt-1 w-full accent-primary" />
          <div className="mono-caps mt-1 flex justify-between text-[8px] text-faint"><span>-10%</span><span>0</span><span>+10%</span></div>
        </div>
        <button onClick={propagate} disabled={running}
          className="mono-caps interactive border border-primary bg-primary/10 px-3 py-2 text-[10px] text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50">
          {running ? "PROPAGATING…" : "PROPAGATE ▶"}
        </button>

        {focusImpact && (
          <div className="border-l-2 border-primary bg-raised p-3 animate-fade-in">
            <div className="mono-caps text-[9px] text-faint">EXPECTED IMPACT · {symbol}</div>
            <div className={`mt-1 font-mono text-3xl tabular-nums ${focusImpact.impact >= 0 ? "text-up" : "text-down"}`}>
              {focusImpact.impact >= 0 ? "+" : ""}{focusImpact.impact.toFixed(1)}%
            </div>
            <div className="mono-caps mt-1 text-[9px] text-faint">
              ± {(Math.abs(focusImpact.impact) * (1 - focusImpact.conf) + 0.5).toFixed(1)}% · confidence {(focusImpact.conf * 100).toFixed(0)}%
            </div>
            <div className="mt-2 font-serif text-[12px] leading-snug text-foreground">
              {target} {shock >= 0 ? "+" : ""}{shock}% ⇒ {symbol} {focusImpact.impact >= 0 ? "+" : ""}{focusImpact.impact.toFixed(1)}%
            </div>
          </div>
        )}

        {result && (
          <div className="border border-divider bg-panel">
            <div className="mono-caps border-b border-divider px-3 py-1.5 text-[9px] text-primary">SECONDARY IMPACTS</div>
            <div className="max-h-64 overflow-y-auto">
              {Object.entries(result).filter(([k]) => k !== target && k !== symbol).map(([k, v]) => (
                <div key={k} className="grid items-center gap-2 border-b border-divider/40 px-3 py-1.5" style={{ gridTemplateColumns: "50px 1fr 50px" }}>
                  <span className="mono-caps text-[10px] text-foreground">{k}</span>
                  <div className="h-2 bg-background relative overflow-hidden">
                    <div className={`absolute top-0 h-full ${v.impact >= 0 ? "bg-up" : "bg-down"}`} style={{ width: `${Math.min(50, Math.abs(v.impact) * 12)}%`, left: v.impact >= 0 ? "50%" : `${50 - Math.min(50, Math.abs(v.impact) * 12)}%` }} />
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  </div>
                  <span className={`text-right font-mono text-[10px] tabular-nums ${v.impact >= 0 ? "text-up" : "text-down"}`}>{v.impact >= 0 ? "+" : ""}{v.impact.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StarGraph({ symbol, deps, target, onTarget, result, pulseKey }: {
  symbol: string;
  deps: ReturnType<typeof depsOf>;
  target: string;
  onTarget: (s: string) => void;
  result: Record<string, { impact: number; conf: number }> | null;
  pulseKey: number;
}) {
  const W = 600, H = 500;
  const cx = W / 2, cy = H / 2, R = 180;
  const focusColor = "#F0A929";
  const impactColor = (v?: number) => {
    if (v === undefined) return "#0A0C0E";
    const t = Math.min(1, Math.abs(v) / 8);
    return v >= 0 ? `rgba(66,201,139,${0.15 + t * 0.6})` : `rgba(240,100,100,${0.15 + t * 0.6})`;
  };
  return (
    <div className="relative h-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        {/* edges */}
        {deps.map((d, i) => {
          const angle = (i / deps.length) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * R, y = cy + Math.sin(angle) * R;
          const isTarget = d.id === target;
          const stroke = DEP_COLOR[d.type];
          return (
            <g key={d.id}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={stroke} strokeWidth={isTarget ? 2 : 0.8}
                strokeOpacity={isTarget ? 0.9 : 0.25} vectorEffect="non-scaling-stroke" />
              {isTarget && result && (
                <circle key={`pulse-${pulseKey}-${d.id}`} r={4} fill={focusColor}>
                  <animateMotion dur="700ms" fill="freeze" path={`M${x},${y} L${cx},${cy}`} />
                  <animate attributeName="opacity" from={1} to={0} dur="700ms" fill="freeze" />
                </circle>
              )}
              <g onClick={() => onTarget(d.id)} style={{ cursor: "pointer" }}
                transform={`translate(${x},${y})`}>
                <circle r={22} fill={impactColor(result?.[d.id]?.impact)} stroke={isTarget ? focusColor : stroke} strokeWidth={isTarget ? 2 : 1} />
                <text textAnchor="middle" dy={3} className="mono-caps" fontSize={9} fill="#E7EAEC">{d.id}</text>
                {result?.[d.id] !== undefined && (
                  <text textAnchor="middle" dy={38} fontSize={9} fill={result[d.id].impact >= 0 ? "#42C98B" : "#F06464"} fontFamily="ui-monospace,monospace">
                    {result[d.id].impact >= 0 ? "+" : ""}{result[d.id].impact.toFixed(1)}%
                  </text>
                )}
              </g>
            </g>
          );
        })}
        {/* center */}
        <g onClick={() => onTarget(symbol)} style={{ cursor: "pointer" }} transform={`translate(${cx},${cy})`}>
          <circle r={32} fill={impactColor(result?.[symbol]?.impact)} stroke={focusColor} strokeWidth={2.5} />
          <text textAnchor="middle" dy={4} className="mono-caps" fontSize={11} fill="#F0A929">{symbol}</text>
        </g>
      </svg>
      <div className="mono-caps pointer-events-none absolute bottom-2 left-3 text-[9px] text-faint">
        Click any node to set shock source. Press PROPAGATE to see impact ripple.
      </div>
      {result?.[symbol] && (
        <div className="mono-caps absolute right-3 top-3 border border-primary bg-primary/10 px-2 py-1 text-[10px] text-primary">
          Est. {symbol} ⇒ <span className={result[symbol].impact >= 0 ? "text-up" : "text-down"}>{result[symbol].impact >= 0 ? "+" : ""}{fmt(result[symbol].impact, 2)}%</span>
          {" ± "}{(Math.abs(result[symbol].impact) * (1 - result[symbol].conf) + 0.5).toFixed(1)}%
        </div>
      )}
    </div>
  );
}

