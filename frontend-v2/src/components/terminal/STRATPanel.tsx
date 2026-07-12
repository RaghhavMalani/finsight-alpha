import { useMemo, useState } from "react";
import { TEMPLATES, listStrategies, saveStrategy, deleteStrategy, type Strategy, type Condition, type Indicator, type Op, type Sizing } from "@/lib/strategies";
import { dailyHistory, TICKERS, fmt } from "@/lib/market";
import { toast } from "sonner";

const OPS: { v: Op; l: string }[] = [
  { v: ">", l: ">" }, { v: "<", l: "<" }, { v: ">=", l: "≥" }, { v: "<=", l: "≤" },
  { v: "CROSS_UP", l: "CROSSES ↑" }, { v: "CROSS_DN", l: "CROSSES ↓" },
];

const INDICATORS: { kind: Indicator["kind"]; label: string; params?: string[] }[] = [
  { kind: "PRICE", label: "Price" },
  { kind: "SMA", label: "SMA" },
  { kind: "RSI", label: "RSI" },
  { kind: "MOMENTUM", label: "Momentum %" },
  { kind: "BB", label: "Bollinger" },
];

export function STRATPanel({ activeSymbol, onSendToBT }: { activeSymbol: string; onSendToBT: (s: Strategy) => void }) {
  const [strat, setStrat] = useState<Strategy>(() => ({
    id: `s-${Date.now()}`,
    name: "Untitled strategy",
    entry: [{ left: { kind: "RSI", period: 14 }, op: "<", right: { kind: "CONST", value: 30 } }],
    exit: [{ left: { kind: "RSI", period: 14 }, op: ">", right: { kind: "CONST", value: 55 } }],
    sizing: { kind: "FIXED", pct: 100 },
    takeProfitPct: 8, stopLossPct: 4,
    createdAt: Date.now(),
  }));
  const [saved, setSaved] = useState<Strategy[]>(() => listStrategies());
  const [ticker, setTicker] = useState(activeSymbol);

  function updateEntry(i: number, c: Condition) {
    setStrat({ ...strat, entry: strat.entry.map((x, idx) => idx === i ? c : x) });
  }
  function addEntry() {
    setStrat({ ...strat, entry: [...strat.entry, { left: { kind: "PRICE" }, op: ">", right: { kind: "SMA", period: 50 } }] });
  }
  function delEntry(i: number) {
    setStrat({ ...strat, entry: strat.entry.filter((_, idx) => idx !== i) });
  }
  function updateExit(i: number, c: Condition) {
    setStrat({ ...strat, exit: strat.exit.map((x, idx) => idx === i ? c : x) });
  }
  function addExit() { setStrat({ ...strat, exit: [...strat.exit, { left: { kind: "PRICE" }, op: "<", right: { kind: "SMA", period: 50 } }] }); }
  function delExit(i: number) { setStrat({ ...strat, exit: strat.exit.filter((_, idx) => idx !== i) }); }

  function save() {
    saveStrategy(strat);
    setSaved(listStrategies());
    toast.success(`Saved · ${strat.name}`);
  }
  function loadTemplate(t: Strategy) {
    setStrat({ ...t, id: `s-${Date.now()}`, name: t.name + " (copy)", createdAt: Date.now() });
  }
  function del(id: string) {
    deleteStrategy(id); setSaved(listStrategies());
  }

  const health = useMemo(() => {
    const n = strat.entry.length + strat.exit.length;
    const perYear = 252;
    const samples = perYear; // 1Y preview
    let risk: "LOW" | "MED" | "HIGH" = "LOW";
    if (n >= 4) risk = "MED";
    if (n >= 6) risk = "HIGH";
    return { conditions: n, samples, risk };
  }, [strat]);
  const entryValid = strat.entry.length >= 1;
  const exitValid = strat.exit.length >= 1;
  const valid = entryValid && exitValid;

  return (
    <div className="grid h-full grid-cols-[280px_1fr_320px] gap-2 overflow-hidden">
      {/* Templates */}
      <div className="flex flex-col overflow-hidden border-r border-divider">
        <div className="mono-caps border-b border-divider bg-panel px-3 py-2 text-[10px] text-primary">TEMPLATES</div>
        <div className="flex-1 overflow-y-auto p-2">
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => loadTemplate(t)} className="interactive block w-full border border-divider bg-raised px-2 py-2 text-left mb-1 hover:border-primary">
              <div className="mono-caps text-[10px] text-foreground">{t.name}</div>
              <div className="mono-caps mt-0.5 text-[8px] text-faint">{t.entry.length} entry · {t.exit.length} exit</div>
            </button>
          ))}
          {saved.length > 0 && <div className="mono-caps mb-1 mt-3 text-[9px] text-faint">SAVED</div>}
          {saved.map((s) => (
            <div key={s.id} className="mb-1 flex items-center gap-1">
              <button onClick={() => loadTemplate(s)} className="interactive flex-1 border border-divider bg-raised px-2 py-2 text-left hover:border-primary">
                <div className="mono-caps text-[10px] text-foreground">{s.name}</div>
              </button>
              <button onClick={() => del(s.id)} className="interactive border border-border px-2 py-2 text-[10px] text-faint hover:text-down">✕</button>
            </div>
          ))}
        </div>
        {/* HEALTH meter */}
        <div className="border-t border-divider bg-panel/60 p-3">
          <div className="mono-caps mb-1 text-[9px] text-primary">STRATEGY HEALTH</div>
          <div className="mono-caps flex items-center justify-between text-[9px] text-faint">
            <span>OVERFIT RISK</span>
            <span className={health.risk === "LOW" ? "text-up" : health.risk === "MED" ? "text-primary" : "text-down"}>{health.risk}</span>
          </div>
          <div className="mt-1 h-1 bg-border">
            <div className={`h-full transition-all ${health.risk === "LOW" ? "bg-up w-1/4" : health.risk === "MED" ? "bg-primary w-2/3" : "bg-down w-full"}`} />
          </div>
          <div className="mono-caps mt-2 text-[9px] text-faint leading-snug">
            {health.conditions} condition{health.conditions !== 1 ? "s" : ""} on 1Y of data → {health.risk === "HIGH" ? "over-fit risk. Reduce rules or extend period." : health.risk === "MED" ? "acceptable; watch OOS decay." : "sample size is generous."}
          </div>
        </div>
      </div>

      {/* Builder */}
      <div className="flex flex-col overflow-y-auto p-4">
        <input value={strat.name} onChange={(e) => setStrat({ ...strat, name: e.target.value })} className="mono-caps mb-4 border-b border-divider bg-transparent pb-1 text-[16px] text-foreground outline-none focus:border-primary" />

        <Block title="ENTRY · when ALL true" color="up" armed={entryValid && valid}>
          {strat.entry.map((c, i) => (
            <ConditionRow key={i} cond={c} onChange={(nc) => updateEntry(i, nc)} onDelete={() => delEntry(i)} />
          ))}
          {!entryValid && <div className="mono-caps mt-1 text-[9px] text-down">Entry needs at least one rule.</div>}
          <button onClick={addEntry} className="mono-caps interactive mt-2 border border-dashed border-border px-3 py-1 text-[10px] text-primary hover:border-primary">+ AND condition</button>
        </Block>

        <Connector valid={valid} />

        <Block title="EXIT · when ANY true" color="down" armed={exitValid && valid}>
          {strat.exit.map((c, i) => (
            <ConditionRow key={i} cond={c} onChange={(nc) => updateExit(i, nc)} onDelete={() => delExit(i)} />
          ))}
          {!exitValid && <div className="mono-caps mt-1 text-[9px] text-down">Exit needs at least one rule.</div>}
          <button onClick={addExit} className="mono-caps interactive mt-2 border border-dashed border-border px-3 py-1 text-[10px] text-primary hover:border-primary">+ OR condition</button>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-divider pt-3">
            <NumField label="TAKE PROFIT %" value={strat.takeProfitPct ?? 0} onChange={(v) => setStrat({ ...strat, takeProfitPct: v })} />
            <NumField label="STOP LOSS %" value={strat.stopLossPct ?? 0} onChange={(v) => setStrat({ ...strat, stopLossPct: v })} />
          </div>
        </Block>

        <Connector valid={valid} />

        <Block title="SIZING" color="primary" armed={valid}>
          <SizingRow sizing={strat.sizing} onChange={(s) => setStrat({ ...strat, sizing: s })} />
        </Block>
      </div>

      {/* Preview */}
      <div className="flex flex-col overflow-hidden border-l border-divider">
        <div className="mono-caps border-b border-divider bg-panel px-3 py-2 text-[10px] text-primary">LIVE PREVIEW</div>
        <div className="mono-caps flex items-center gap-2 border-b border-divider px-3 py-2 text-[9px]">
          <span className="text-faint">TICKER</span>
          <select value={ticker} onChange={(e) => setTicker(e.target.value)} className="border border-border bg-background px-2 py-1 text-foreground">
            {TICKERS.filter((t) => t !== "BTC-USD").map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <SignalPreview strat={strat} ticker={ticker} />
        <div className="border-t border-divider p-3">
          <div className="flex gap-2">
            <button onClick={save} className="mono-caps interactive flex-1 border border-primary bg-primary/10 px-3 py-2 text-[10px] text-primary hover:bg-primary hover:text-primary-foreground">SAVE</button>
            <button onClick={() => { save(); onSendToBT(strat); }} disabled={!valid} className="mono-caps interactive flex-1 border border-primary bg-primary px-3 py-2 text-[10px] text-primary-foreground hover:brightness-110 disabled:opacity-40">SEND TO BT →</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ title, color, armed, children }: { title: string; color: "up" | "down" | "primary"; armed?: boolean; children: React.ReactNode }) {
  const c = color === "up" ? "border-up/40" : color === "down" ? "border-down/40" : "border-primary/40";
  const t = color === "up" ? "text-up" : color === "down" ? "text-down" : "text-primary";
  return (
    <div className={`border-l-2 ${c} bg-raised p-3 animate-fade-in`}>
      <div className={`mono-caps mb-2 flex items-center justify-between text-[10px] ${t}`}>
        <span>{title}</span>
        <span className="mono-caps flex items-center gap-1 text-[9px]">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${armed ? "bg-up animate-pulse-live" : "bg-border"}`} />
          {armed ? "ARMED" : "IDLE"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Connector({ valid }: { valid?: boolean }) {
  return (
    <div className="relative my-2 ml-3 h-5 w-px bg-primary/40 overflow-visible">
      {valid && (
        <span className="absolute left-1/2 -translate-x-1/2 top-0 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_#F0A929]" style={{ animation: "strat-pulse 1.4s ease-in-out infinite" }} />
      )}
      <style>{`@keyframes strat-pulse { 0% { top: -4px; opacity: 0 } 20% { opacity: 1 } 80% { opacity: 1 } 100% { top: 22px; opacity: 0 } }`}</style>
    </div>
  );
}


function ConditionRow({ cond, onChange, onDelete }: { cond: Condition; onChange: (c: Condition) => void; onDelete: () => void }) {
  return (
    <div className="mb-1 grid grid-cols-[1fr_100px_1fr_auto] items-center gap-2">
      <IndicatorSelect ind={cond.left} onChange={(i) => onChange({ ...cond, left: i })} />
      <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as Op })} className="mono-caps interactive border border-border bg-background px-1 py-1 text-[10px] text-foreground">
        {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <RightSelect right={cond.right} onChange={(r) => onChange({ ...cond, right: r })} />
      <button onClick={onDelete} className="interactive border border-border px-2 text-[10px] text-faint hover:text-down">✕</button>
    </div>
  );
}

function IndicatorSelect({ ind, onChange }: { ind: Indicator; onChange: (i: Indicator) => void }) {
  return (
    <div className="flex items-center gap-1">
      <select value={ind.kind} onChange={(e) => {
        const k = e.target.value as Indicator["kind"];
        if (k === "PRICE") onChange({ kind: "PRICE" });
        else if (k === "BB") onChange({ kind: "BB", period: 20, band: "UPPER" });
        else onChange({ kind: k, period: 14 } as Indicator);
      }} className="mono-caps interactive border border-border bg-background px-1 py-1 text-[10px] text-foreground">
        {INDICATORS.map((i) => <option key={i.kind} value={i.kind}>{i.label}</option>)}
      </select>
      {"period" in ind && (
        <input type="number" value={ind.period} onChange={(e) => onChange({ ...ind, period: Math.max(1, Number(e.target.value)) } as Indicator)} className="w-12 border border-border bg-background px-1 py-1 font-mono text-[10px] text-foreground" />
      )}
      {ind.kind === "BB" && (
        <select value={ind.band} onChange={(e) => onChange({ ...ind, band: e.target.value as "UPPER" | "LOWER" | "MID" })} className="mono-caps border border-border bg-background px-1 py-1 text-[9px] text-foreground">
          <option value="UPPER">UP</option><option value="MID">MID</option><option value="LOWER">LO</option>
        </select>
      )}
    </div>
  );
}

function RightSelect({ right, onChange }: { right: Condition["right"]; onChange: (r: Condition["right"]) => void }) {
  const isConst = right.kind === "CONST";
  return (
    <div className="flex items-center gap-1">
      <select value={isConst ? "CONST" : "IND"} onChange={(e) => {
        if (e.target.value === "CONST") onChange({ kind: "CONST", value: 50 });
        else onChange({ kind: "SMA", period: 50 });
      }} className="mono-caps interactive border border-border bg-background px-1 py-1 text-[10px] text-foreground">
        <option value="CONST">value</option><option value="IND">indicator</option>
      </select>
      {isConst ? (
        <input type="number" value={right.value} onChange={(e) => onChange({ kind: "CONST", value: Number(e.target.value) })} className="w-16 border border-border bg-background px-1 py-1 font-mono text-[10px] text-foreground" />
      ) : (
        <IndicatorSelect ind={right} onChange={(i) => onChange(i)} />
      )}
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="mono-caps text-[9px] text-faint">{label}</div>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full border border-border bg-background px-2 py-1 font-mono text-[11px] text-foreground" />
    </label>
  );
}

function SizingRow({ sizing, onChange }: { sizing: Sizing; onChange: (s: Sizing) => void }) {
  return (
    <div>
      <div className="mono-caps mb-2 flex gap-1 text-[9px]">
        {(["FIXED","VOL_TARGET","KELLY"] as const).map((k) => (
          <button key={k} onClick={() => {
            if (k === "FIXED") onChange({ kind: "FIXED", pct: 100 });
            else if (k === "VOL_TARGET") onChange({ kind: "VOL_TARGET", targetVol: 0.20 });
            else onChange({ kind: "KELLY", fraction: 0.5 });
          }} className={`interactive border px-2 py-1 ${sizing.kind === k ? "border-primary text-primary bg-primary/10" : "border-border text-faint hover:text-foreground"}`}>{k.replace("_"," ")}</button>
        ))}
      </div>
      {sizing.kind === "FIXED" && <NumField label="% OF EQUITY" value={sizing.pct} onChange={(v) => onChange({ kind: "FIXED", pct: v })} />}
      {sizing.kind === "VOL_TARGET" && <NumField label="ANNUALIZED VOL TARGET" value={sizing.targetVol} onChange={(v) => onChange({ kind: "VOL_TARGET", targetVol: v })} />}
      {sizing.kind === "KELLY" && <NumField label="KELLY FRACTION" value={sizing.fraction} onChange={(v) => onChange({ kind: "KELLY", fraction: v })} />}
    </div>
  );
}

function SignalPreview({ strat, ticker }: { strat: Strategy; ticker: string }) {
  const bars = useMemo(() => dailyHistory(ticker, 252), [ticker]);
  const prices = bars.map((b) => b.p);
  const signals = useMemo(() => {
    const out: { i: number; kind: "E" | "X" }[] = [];
    let inPos = false;
    for (let i = 1; i < prices.length; i++) {
      if (inPos) {
        if (strat.exit.some((c) => evalCond(c, prices, i))) { out.push({ i, kind: "X" }); inPos = false; }
      } else if (strat.entry.every((c) => evalCond(c, prices, i))) { out.push({ i, kind: "E" }); inPos = true; }
    }
    return out;
  }, [strat, prices]);
  const min = Math.min(...prices); const max = Math.max(...prices);
  const s = (v: number, i: number) => { const x = (i/(prices.length-1))*400; const y = 100 - ((v-min)/(max-min||1))*90 - 5; return `${x},${y}`; };
  const pts = prices.map((p, i) => s(p, i)).join(" ");
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <svg viewBox="0 0 400 100" className="h-24 w-full" preserveAspectRatio="none">
        <polyline points={pts} fill="none" stroke="#E7EAEC" strokeWidth={0.7} vectorEffect="non-scaling-stroke" opacity={0.7} />
        {signals.map((sig, k) => {
          const x = (sig.i / (prices.length - 1)) * 400;
          const y = 100 - ((prices[sig.i] - min) / (max - min || 1)) * 90 - 5;
          return sig.kind === "E"
            ? <text key={k} x={x} y={y + 8} fontSize={7} fill="#42C98B" textAnchor="middle">▲</text>
            : <text key={k} x={x} y={y - 3} fontSize={7} fill="#F0A929" textAnchor="middle">▼</text>;
        })}
      </svg>
      <div className="mono-caps mt-2 flex justify-between text-[9px] text-faint">
        <span>SIGNALS · {signals.filter(s=>s.kind==="E").length} ENTRIES</span>
        <span>${fmt(prices[prices.length-1], 2)}</span>
      </div>
      <div className="mono-caps mt-4 border-t border-divider pt-3 text-[10px] text-muted-foreground">
        Preview runs current rules on the last 1Y of {ticker}. Save the strategy and it appears in BT's list.
      </div>
    </div>
  );
}

function evalCond(c: Condition, prices: number[], i: number): boolean {
  const val = (ind: Indicator, i: number) => {
    if (ind.kind === "PRICE") return prices[i];
    if (ind.kind === "SMA") { if (i < ind.period-1) return NaN; let s=0; for (let k=i-ind.period+1;k<=i;k++) s+=prices[k]; return s/ind.period; }
    if (ind.kind === "RSI") { if (i < ind.period) return NaN; let u=0,d=0; for (let k=i-ind.period+1;k<=i;k++){const x=prices[k]-prices[k-1]; if (x>0) u+=x; else d-=x;} if (u+d===0) return 50; return 100-100/(1+u/Math.max(1e-9,d)); }
    if (ind.kind === "MOMENTUM") { if (i < ind.period) return NaN; return ((prices[i]-prices[i-ind.period])/prices[i-ind.period])*100; }
    if (ind.kind === "BB") { if (i < ind.period-1) return NaN; let s=0; for (let k=i-ind.period+1;k<=i;k++) s+=prices[k]; const m=s/ind.period; let v=0; for (let k=i-ind.period+1;k<=i;k++) v+=(prices[k]-m)**2; const sd=Math.sqrt(v/ind.period); return ind.band==="MID"?m:ind.band==="UPPER"?m+2*sd:m-2*sd; }
    return NaN;
  };
  const L = val(c.left, i); const R = c.right.kind === "CONST" ? c.right.value : val(c.right, i);
  const Lp = val(c.left, i-1); const Rp = c.right.kind === "CONST" ? c.right.value : val(c.right, i-1);
  if (isNaN(L) || isNaN(R)) return false;
  switch (c.op) {
    case ">": return L > R; case "<": return L < R;
    case ">=": return L >= R; case "<=": return L <= R;
    case "==": return Math.abs(L - R) < 1e-9;
    case "CROSS_UP": return !isNaN(Lp) && !isNaN(Rp) && Lp <= Rp && L > R;
    case "CROSS_DN": return !isNaN(Lp) && !isNaN(Rp) && Lp >= Rp && L < R;
  }
}

