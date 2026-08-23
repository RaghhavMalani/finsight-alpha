import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { fmt, fmtPct } from "@/lib/market";

const Landscape = lazy(() => import("./MonteCarloLandscape"));

type Paths = 1000 | 10000 | 50000;
type Horizon = 21 | 63 | 252;

type MonteCarloStudy = {
  snapshot_id: string;
  ticker: string;
  source: string;
  observed_at: string | null;
  available_at: string | null;
  license: string;
  model_version: string;
  quality: { status: string; flags: string[] };
  assumptions: string[];
  calibration: {
    method: string;
    observations: number;
    lookback_max_days: number;
    mu_annual: number;
    sigma_annual: number;
  };
  S0: number;
  horizon_days: number;
  horizon_years: number;
  seed: number;
  summary: {
    expected_final_price: number;
    median_final_price: number;
    expected_shortfall_price: number;
    probability_of_loss: number;
    expected_return: number;
    num_simulations: number;
    num_steps: number;
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
  };
  fan: {
    days: number[];
    p5: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p95: number[];
  };
  sampled_paths: number[][] | null;
  convergence: {
    terminal_mean_stderr: number;
    relative_terminal_mean_stderr: number;
    batch_mean_stddev: number;
    half_sample_quantile_deltas: { p5: number; p50: number; p95: number };
  };
};

const HORIZON_LABEL: Record<Horizon, string> = {
  21: "1 month",
  63: "3 months",
  252: "1 year",
};

export function MonteCarloPanel({ spot, symbol }: { spot: number; symbol: string }) {
  const [pathCount, setPathCount] = useState<Paths>(10000);
  const [horizon, setHorizon] = useState<Horizon>(63);
  const [seed, setSeed] = useState(42);
  const [show3D, setShow3D] = useState(false);
  const [explain, setExplain] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const studyQuery = useQuery({
    queryKey: ["monte-carlo", symbol, horizon, pathCount, seed, show3D],
    queryFn: () =>
      api<MonteCarloStudy>(
        `/risk/montecarlo/${encodeURIComponent(symbol)}?horizon_days=${horizon}&n=${pathCount}&seed=${seed}&include_paths=${show3D}`,
      ),
    staleTime: 5 * 60_000,
  });

  const study = studyQuery.data;
  const effectiveSpot = study?.S0 ?? spot;
  const bands = study?.fan;
  const stats = study
    ? {
        p5T: study.summary.p5,
        p50T: study.summary.p50,
        p95T: study.summary.p95,
        ev: study.summary.expected_final_price,
        es: study.summary.expected_shortfall_price,
      }
    : null;

  function run() {
    setSeed((current) => current + 1);
    toast.info("Monte Carlo rerun queued with a new reproducible seed.");
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-divider bg-panel/60 px-4 py-2.5">
        <div className="font-serif text-[15px] leading-snug text-foreground">
          <span className="mono-caps mr-2 text-[11px] text-primary">MONTE CARLO</span>
          {(study?.summary.num_simulations ?? pathCount).toLocaleString()} simulated futures for{" "}
          <span className="text-primary">{symbol}</span> over {HORIZON_LABEL[horizon]}. Where could
          the price realistically go?
        </div>
        {study && (
          <div className="mono-caps mt-1 flex flex-wrap gap-x-3 text-[11px] text-faint">
            <span>AS OF {study.observed_at?.slice(0, 10) ?? "UNKNOWN"}</span>
            <span>SOURCE {study.source}</span>
            <span>MODEL {study.model_version}</span>
            <span>SEED {study.seed}</span>
          </div>
        )}
      </div>

      <div className="mono-caps flex flex-wrap items-center gap-2 border-b border-divider px-3 py-1.5 text-[11px]">
        <span className="text-faint">
          σ={study ? `${(study.calibration.sigma_annual * 100).toFixed(1)}%` : "…"}
          {" · "}
          μ={study ? `${(study.calibration.mu_annual * 100).toFixed(1)}%` : "…"}
        </span>
        <span className="ml-3 text-faint">PATHS</span>
        <div className="flex gap-0.5">
          {([1000, 10000, 50000] as Paths[]).map((count) => (
            <button
              key={count}
              onClick={() => setPathCount(count)}
              className={`interactive border px-1.5 py-0.5 text-[11px] ${
                pathCount === count
                  ? "border-primary text-primary"
                  : "border-border text-faint hover:text-foreground"
              }`}
            >
              {count >= 1000 ? `${count / 1000}k` : count}
            </button>
          ))}
        </div>
        <span className="ml-2 text-faint">HORIZON</span>
        <div className="flex gap-0.5">
          {(
            [
              { v: 21, l: "1M" },
              { v: 63, l: "3M" },
              { v: 252, l: "1Y" },
            ] as { v: Horizon; l: string }[]
          ).map((item) => (
            <button
              key={item.v}
              onClick={() => setHorizon(item.v)}
              className={`interactive border px-1.5 py-0.5 text-[11px] ${
                horizon === item.v
                  ? "border-primary text-primary"
                  : "border-border text-faint hover:text-foreground"
              }`}
            >
              {item.l}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShow3D((value) => !value)}
          className={`interactive ml-2 border px-1.5 py-0.5 text-[11px] ${
            show3D
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-faint hover:text-foreground"
          }`}
        >
          [3D] {show3D ? "ON" : "OFF"}
        </button>
        <button
          onClick={run}
          disabled={studyQuery.isFetching}
          className="mono-caps interactive ml-auto border border-primary bg-primary/10 px-3 py-0.5 text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
        >
          {studyQuery.isFetching ? "RUNNING…" : "RUN ▶"}
        </button>
      </div>

      {studyQuery.isPending ? (
        <PanelState message="Calibrating from observed history and running simulations…" />
      ) : studyQuery.isError ? (
        <PanelState
          tone="error"
          message={
            studyQuery.error instanceof Error
              ? studyQuery.error.message
              : "Monte Carlo research is unavailable."
          }
        />
      ) : !study || !bands || !stats ? (
        <PanelState tone="error" message="The backend returned an incomplete simulation." />
      ) : show3D ? (
        <div className="relative flex-1">
          {mounted && study.sampled_paths ? (
            <Suspense fallback={<PanelState message="Building the sampled 3D landscape…" />}>
              <Landscape
                paths={study.sampled_paths}
                buildKey={study.seed}
                spot={effectiveSpot}
                horizonDays={horizon}
              />
            </Suspense>
          ) : (
            <PanelState message="Loading sampled paths for 3D inspection…" />
          )}
        </div>
      ) : (
        <div className="grid flex-1 overflow-hidden" style={{ gridTemplateColumns: "1.9fr 1fr" }}>
          <FanChart
            bands={bands}
            spot={effectiveSpot}
            stats={stats}
            symbol={symbol}
            horizonDays={horizon}
            seed={study.seed}
          />
          <div className="flex flex-col gap-2 overflow-y-auto border-l border-divider bg-panel/40 p-4">
            <ScenarioCard
              tone="down"
              label="BEAR · p5"
              price={stats.p5T}
              spot={effectiveSpot}
              prob={0.05}
              sentence={`1-in-20 outcomes end at or below ${fmt(stats.p5T)} — a ${fmtPct((stats.p5T - effectiveSpot) / effectiveSpot)} move.`}
            />
            <ScenarioCard
              tone="neutral"
              label="BASE · p50"
              price={stats.p50T}
              spot={effectiveSpot}
              prob={0.5}
              sentence={`Half of paths finish beyond ${fmt(stats.p50T)}. The median move is ${fmtPct((stats.p50T - effectiveSpot) / effectiveSpot)}.`}
            />
            <ScenarioCard
              tone="up"
              label="BULL · p95"
              price={stats.p95T}
              spot={effectiveSpot}
              prob={0.05}
              sentence={`1-in-20 outcomes end at or above ${fmt(stats.p95T)} — a ${fmtPct((stats.p95T - effectiveSpot) / effectiveSpot)} move.`}
            />

            <div className="mt-2 border border-divider bg-raised">
              <button
                onClick={() => setExplain((value) => !value)}
                className="mono-caps interactive flex w-full items-center justify-between px-3 py-2 text-[11px] text-primary"
              >
                <span>INSPECT MODEL</span>
                <span className="text-faint">{explain ? "−" : "+"}</span>
              </button>
              {explain && (
                <div className="border-t border-divider p-3 font-serif text-[13px] leading-relaxed text-muted-foreground">
                  <p>{study.assumptions.join(" ")}</p>
                  <p className="mt-2 font-mono text-[11px]">
                    Mean standard error: {fmt(study.convergence.terminal_mean_stderr)}
                    {" · "}quality: {study.quality.flags.join(", ") || "OK"}
                  </p>
                </div>
              )}
            </div>

            <div className="mono-caps mt-1 grid grid-cols-2 gap-2 text-[11px]">
              <div className="border border-divider bg-raised px-2 py-1.5">
                <div className="text-faint">EXPECTED VALUE</div>
                <div className="font-mono text-[13px] tabular-nums text-foreground">
                  {fmt(stats.ev)}
                </div>
              </div>
              <div className="border border-divider bg-raised px-2 py-1.5">
                <div className="text-faint">TAIL PRICE · ES 5%</div>
                <div className="font-mono text-[13px] tabular-nums text-down">{fmt(stats.es)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelState({
  message,
  tone = "neutral",
}: {
  message: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div
      className={`mono-caps flex flex-1 items-center justify-center p-6 text-[12px] ${
        tone === "error" ? "text-down" : "text-faint"
      }`}
    >
      {message}
    </div>
  );
}

function ScenarioCard({
  tone,
  label,
  price,
  spot,
  prob,
  sentence,
}: {
  tone: "up" | "down" | "neutral";
  label: string;
  price: number;
  spot: number;
  prob: number;
  sentence: string;
}) {
  const pct = (price - spot) / spot;
  const color =
    tone === "up"
      ? "text-up border-up/40"
      : tone === "down"
        ? "text-down border-down/40"
        : "text-foreground border-primary/40";
  const chip = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className={`border-l-2 ${color} bg-raised px-3 py-2.5`}>
      <div className="mono-caps flex items-center justify-between text-[11px] text-faint">
        <span className={chip}>{label}</span>
        <span>P ≈ {(prob * 100).toFixed(0)}%</span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="font-mono text-xl tabular-nums text-foreground">{fmt(price)}</span>
        <span className={`mono-caps text-[11px] ${chip}`}>{fmtPct(pct)}</span>
      </div>
      <div className="mt-1 font-serif text-[12px] leading-snug text-muted-foreground">
        {sentence}
      </div>
    </div>
  );
}

function FanChart({
  bands,
  spot,
  stats,
  symbol,
  horizonDays,
  seed,
}: {
  bands: { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] };
  spot: number;
  stats: { p5T: number; p50T: number; p95T: number };
  symbol: string;
  horizonDays: number;
  seed: number;
}) {
  const n = bands.p5.length;
  const W = 1000,
    H = 380,
    ML = 40,
    MR = 90,
    MT = 20,
    MB = 32;
  const iw = W - ML - MR,
    ih = H - MT - MB;
  const all = [...bands.p5, ...bands.p95, spot];
  const min = Math.min(...all) * 0.995;
  const max = Math.max(...all) * 1.005;
  const xAt = (i: number) => ML + (i / (n - 1)) * iw;
  const yAt = (v: number) => MT + ih - ((v - min) / (max - min)) * ih;
  const poly = (a: number[], b: number[]) =>
    a.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ") +
    " " +
    b.map((v, i) => `${xAt(n - 1 - i)},${yAt(b[b.length - 1 - i])}`).join(" ");
  const line = (a: number[]) => a.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const spotY = yAt(spot);
  const endX = xAt(n - 1);
  const today = new Date();
  const horizonDate = new Date(today);
  for (let tradingDay = 0; tradingDay < horizonDays;) {
    horizonDate.setDate(horizonDate.getDate() + 1);
    const day = horizonDate.getDay();
    if (day !== 0 && day !== 6) tradingDay += 1;
  }
  const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  // y-axis ticks
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + (i / ticks) * (max - min));

  return (
    <div className="relative flex flex-col overflow-hidden bg-panel/20 p-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        key={seed}
      >
        {/* grid */}
        {tickVals.map((v, i) => (
          <g key={i}>
            <line
              x1={ML}
              x2={ML + iw}
              y1={yAt(v)}
              y2={yAt(v)}
              stroke="#171B1F"
              strokeWidth={0.5}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={ML - 6}
              y={yAt(v) + 3}
              fontSize={9}
              fill="#636C74"
              textAnchor="end"
              fontFamily="ui-monospace,monospace"
            >
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        {/* outer p5-p95 band */}
        <polygon
          points={poly(bands.p5, bands.p95)}
          fill="#21918C"
          fillOpacity={0.14}
          stroke="none"
        />
        {/* inner p25-p75 band */}
        <polygon
          points={poly(bands.p25, bands.p75)}
          fill="#3B528B"
          fillOpacity={0.3}
          stroke="none"
        />
        {/* spot line */}
        <line
          x1={ML}
          x2={ML + iw}
          y1={spotY}
          y2={spotY}
          stroke="#9AA2A9"
          strokeDasharray="3 4"
          strokeWidth={0.7}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={ML + 4}
          y={spotY - 4}
          fontSize={9}
          fill="#9AA2A9"
          fontFamily="ui-monospace,monospace"
        >
          SPOT {fmt(spot)}
        </text>
        {/* median amber */}
        <polyline
          points={line(bands.p50)}
          fill="none"
          stroke="#F0A929"
          strokeWidth={1.7}
          vectorEffect="non-scaling-stroke"
          style={{
            strokeDasharray: 3000,
            strokeDashoffset: 0,
            animation: "mc-draw 900ms cubic-bezier(0.16,1,0.3,1) both",
          }}
        />
        {/* endpoint annotations */}
        <EndpointChip
          x={endX}
          y={yAt(stats.p95T)}
          label="BULL p95"
          price={stats.p95T}
          spot={spot}
          color="#42C98B"
        />
        <EndpointChip
          x={endX}
          y={yAt(stats.p50T)}
          label="BASE p50"
          price={stats.p50T}
          spot={spot}
          color="#F0A929"
        />
        <EndpointChip
          x={endX}
          y={yAt(stats.p5T)}
          label="BEAR p5"
          price={stats.p5T}
          spot={spot}
          color="#F06464"
        />
        {/* x-axis */}
        <text x={ML} y={H - 10} fontSize={10} fill="#636C74" fontFamily="ui-monospace,monospace">
          TODAY · {fmtDate(today)}
        </text>
        <text
          x={ML + iw}
          y={H - 10}
          fontSize={10}
          fill="#636C74"
          fontFamily="ui-monospace,monospace"
          textAnchor="end"
        >
          {fmtDate(horizonDate)}
        </text>
        <style>{`@keyframes mc-draw { from { stroke-dashoffset: 3000 } to { stroke-dashoffset: 0 } }`}</style>
      </svg>
      <div className="mono-caps mt-1 flex items-center gap-3 text-[11px] text-faint">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4" style={{ background: "#21918C", opacity: 0.4 }} />
          p5-p95
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-4" style={{ background: "#3B528B", opacity: 0.6 }} />
          p25-p75
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-0.5 w-4 bg-primary" />
          MEDIAN
        </span>
        <span className="ml-auto">{symbol}</span>
      </div>
    </div>
  );
}

function EndpointChip({
  x,
  y,
  label,
  price,
  spot,
  color,
}: {
  x: number;
  y: number;
  label: string;
  price: number;
  spot: number;
  color: string;
}) {
  const pct = ((price - spot) / spot) * 100;
  return (
    <g>
      <circle cx={x} cy={y} r={2.5} fill={color} />
      <line
        x1={x}
        x2={x + 6}
        y1={y}
        y2={y}
        stroke={color}
        strokeWidth={0.7}
        vectorEffect="non-scaling-stroke"
      />
      <text x={x + 10} y={y - 3} fontSize={9} fill={color} fontFamily="ui-monospace,monospace">
        {label}
      </text>
      <text
        x={x + 10}
        y={y + 8}
        fontSize={10}
        fill="#E7EAEC"
        fontFamily="ui-monospace,monospace"
        fontWeight={600}
      >
        {price.toFixed(2)}
      </text>
      <text x={x + 10} y={y + 19} fontSize={8} fill={color} fontFamily="ui-monospace,monospace">
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </text>
    </g>
  );
}
