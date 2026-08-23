import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Panel } from "@/components/terminal/Panel";
import { api } from "@/lib/api";

type UniverseItem = {
  symbol: string;
  quote_symbol: string;
  name: string;
  region: "US" | "IN";
  exchange: string;
  asset_type: "EQUITY" | "ETF" | "INDEX";
  currency: string;
  source: string;
};

type UniversePayload = {
  total_catalog: number;
  matched: number;
  coverage: Record<string, number>;
  sources: Array<{ source: string; ok: boolean; rows?: number; error?: string }>;
  items: UniverseItem[];
};

type MacroIndicator = {
  key: string;
  label: string;
  unit: string;
  signal: {
    latest: number | null;
    date: string | null;
    change: number | null;
    z_score: number | null;
    trend: string;
  };
};

type MacroRelay = {
  countries: string[];
  profiles: Array<{
    country: string;
    name: string;
    latest_observation: string | null;
    indicators: MacroIndicator[];
  }>;
  factor_impulses: Record<string, Record<string, number>>;
  similarities: Array<{ left: string; right: string; similarity: number }>;
  narratives: string[];
  graph: { nodes: unknown[]; edges: unknown[] };
  methodology: string;
};

type Structure = {
  ticker: string;
  as_of: string;
  sessions: number;
  price: number;
  structure: {
    trend: string;
    sma20: number | null;
    sma50: number | null;
    sma200: number | null;
    rsi14: number | null;
    atr_pct: number | null;
    ann_vol20: number;
    vol_percentile: number;
    drawdown: number | null;
    position_52w: number | null;
  };
  levels: { support: Level[]; resistance: Level[] };
  patterns: Array<{ pattern: string; active: boolean; [key: string]: unknown }>;
  historical_analogs: Analog[];
  analog_forward_distribution: Record<
    string,
    {
      median: number | null;
      bull_probability: number | null;
      worst: number | null;
      best: number | null;
    }
  >;
  major_moves: {
    daily: Array<{ date: string; return: number; direction: string }>;
    windows: unknown[];
  };
  scenario_anchors: Record<string, number | null>;
  methodology: string;
};

type Level = { price: number; distance_pct: number; touches: number; strength: number };
type Analog = {
  date: string;
  price: number;
  similarity: number;
  forward_5d: number | null;
  forward_20d: number | null;
  forward_60d: number | null;
};

type ModelStress = {
  models_tested: number;
  scenarios_tested: number;
  robustness_ranking: Array<{
    model: string;
    robustness_score: number;
    worst_scenario: string;
    worst_auc_change: number | null;
    max_flip_rate: number | null;
    baseline: { accuracy: number | null; roc_auc: number | null; brier_score: number | null };
    regime_slices: Array<{
      regime: string;
      observations: number;
      accuracy: number | null;
      roc_auc: number | null;
    }>;
  }>;
  scenario_summary: Array<{
    scenario: string;
    label: string;
    mean_auc_change: number | null;
    mean_flip_rate: number | null;
    models: number;
  }>;
  methodology: string;
};

type MLSignal = {
  ticker: string;
  signal: {
    label: string;
    allowed: boolean;
    strength: string;
    prob_up: number | null;
    explanation: string;
  };
  validation: {
    best_model: string;
    roc_auc: number | null;
    model_edge: number | null;
    brier_score: number | null;
  };
  model_stress?: ModelStress;
};

function percent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

function number(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function QueryNotice({ loading, error }: { loading: boolean; error: unknown }) {
  if (loading)
    return (
      <div className="mono-caps p-4 text-[8px] text-info animate-pulse-live">
        CALCULATING · SOURCE PIPELINES ACTIVE
      </div>
    );
  if (error)
    return (
      <div className="p-4 text-[10px] text-down">
        {error instanceof Error ? error.message : "Source unavailable"}
      </div>
    );
  return null;
}

export function RiskIntelligenceLab({ ticker }: { ticker: string }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<"ALL" | "US" | "IN">("ALL");
  const universe = useQuery({
    queryKey: ["universe", query, region],
    queryFn: () =>
      api<UniversePayload>(
        `/universe/search?q=${encodeURIComponent(query)}&regions=${region === "ALL" ? "" : region}&limit=80`,
      ),
    staleTime: 60 * 60 * 1000,
  });
  const macro = useQuery({
    queryKey: ["macro-relay", "USA,IND,CHN"],
    queryFn: () => api<MacroRelay>("/macro/relay?countries=USA,IND,CHN&years=15"),
    staleTime: 6 * 60 * 60 * 1000,
    retry: 0,
  });
  const structure = useQuery({
    queryKey: ["risk-structure", ticker],
    queryFn: () => api<Structure>(`/risk/structure/${encodeURIComponent(ticker)}`),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
  const models = useQuery({
    queryKey: ["model-stress", ticker],
    queryFn: () =>
      api<MLSignal>(
        `/ml/signal/${encodeURIComponent(ticker)}?benchmark=SPY&horizon=1&as_of=${new Date().toISOString().slice(0, 10)}`,
      ),
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });

  const stress = models.data?.model_stress;
  const bestRobust = stress?.robustness_ranking[0];
  const activePatterns = structure.data?.patterns.filter((row) => row.active) ?? [];

  return (
    <div className="space-y-3">
      <Panel
        code="SYS"
        title="Whole-system intelligence"
        subtitle="Exchange masters, country macro relays, historical structure, and adversarial model validation in one governed view."
        live
        right={<span className="mono-caps text-[8px] text-info">{ticker} · CONNECTED</span>}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Headline
            label="INSTRUMENT CATALOG"
            value={universe.data?.total_catalog.toLocaleString() ?? "…"}
            detail="US + INDIA · SOURCE BACKED"
          />
          <Headline
            label="MACRO RELAY"
            value={macro.data ? `${macro.data.countries.length} COUNTRIES` : "…"}
            detail={macro.data ? `${macro.data.graph.edges.length} EXPLAINED LINKS` : "WORLD BANK"}
          />
          <Headline
            label="MODEL ROBUSTNESS"
            value={bestRobust ? `${number(bestRobust.robustness_score, 0)}/100` : "…"}
            detail={bestRobust ? bestRobust.model.replaceAll("_", " ") : "ALL MODELS"}
            tone={bestRobust && bestRobust.robustness_score < 60 ? "down" : "primary"}
          />
          <Headline
            label="MARKET STRUCTURE"
            value={structure.data?.structure.trend ?? "…"}
            detail={
              structure.data ? `${activePatterns.length} ACTIVE PATTERNS` : "HISTORICAL ANALOGS"
            }
            tone={structure.data?.structure.trend === "BEAR" ? "down" : "neutral"}
          />
        </div>
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[1.15fr_.85fr]">
        <Panel
          code="UNI"
          title="India + US instrument atlas"
          subtitle="Search the full provider-backed exchange directory; the terminal no longer depends on eleven hard-coded symbols."
          right={<span className="mono-caps text-[8px] text-faint">NASDAQ · SEC · NSE · BSE</span>}
        >
          <div className="flex flex-wrap gap-2 border-b border-divider p-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="SYMBOL OR ISSUER"
              className="min-w-52 flex-1 border border-border bg-background px-3 py-2 font-mono text-[10px] text-foreground outline-none focus:border-primary"
            />
            {(["ALL", "US", "IN"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setRegion(key)}
                className={`mono-caps border px-3 py-2 text-[8px] ${region === key ? "border-primary bg-primary/10 text-primary" : "border-border text-faint"}`}
              >
                {key}
              </button>
            ))}
          </div>
          <QueryNotice loading={universe.isLoading} error={universe.error} />
          {universe.data && (
            <>
              <div className="grid grid-cols-[86px_1fr_64px_86px_70px] gap-2 border-b border-divider px-3 py-2">
                <Col value="SYMBOL" />
                <Col value="SECURITY" />
                <Col value="REGION" />
                <Col value="EXCHANGE" />
                <Col value="TYPE" right />
              </div>
              <div className="max-h-[390px] overflow-y-auto">
                {universe.data.items.map((item) => (
                  <div
                    key={`${item.region}-${item.asset_type}-${item.quote_symbol}`}
                    className="grid grid-cols-[86px_1fr_64px_86px_70px] items-center gap-2 border-b border-divider/70 px-3 py-2 hover:bg-primary/[.03]"
                  >
                    <span className="truncate font-mono text-[9px] text-primary">
                      {item.quote_symbol}
                    </span>
                    <span className="truncate text-[10px] text-foreground">{item.name}</span>
                    <span className="mono-caps text-[7px] text-muted-foreground">
                      {item.region} · {item.currency}
                    </span>
                    <span className="truncate mono-caps text-[7px] text-faint">
                      {item.exchange}
                    </span>
                    <span className="text-right mono-caps text-[7px] text-muted-foreground">
                      {item.asset_type}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        <Panel
          code="COV"
          title="Coverage + provenance"
          subtitle="Coverage is counted from the current cached exchange masters; source failures stay visible."
        >
          <div className="grid grid-cols-2 border-b border-divider">
            {Object.entries(universe.data?.coverage ?? {}).map(([key, value]) => (
              <Headline
                key={key}
                label={key.replace("_", " · ")}
                value={value.toLocaleString()}
                detail="CATALOG ROWS"
              />
            ))}
          </div>
          <div className="divide-y divide-divider">
            {(universe.data?.sources ?? []).map((source) => (
              <div
                key={source.source}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div>
                  <div className="mono-caps text-[8px] text-foreground">{source.source}</div>
                  <div className="mt-1 truncate text-[8px] text-faint">
                    {source.ok ? `${source.rows ?? 0} rows loaded` : source.error}
                  </div>
                </div>
                <span className={`mono-caps text-[7px] ${source.ok ? "text-up" : "text-down"}`}>
                  {source.ok ? "ONLINE" : "DEGRADED"}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        code="MAC"
        title="Country macro relay"
        subtitle="Annual structural data is standardized within each country, then transmitted through disclosed factor links."
        right={
          <span className="mono-caps text-[8px] text-info">WORLD BANK · DATED OBSERVATIONS</span>
        }
      >
        <QueryNotice loading={macro.isLoading} error={macro.error} />
        {macro.data && (
          <div className="grid xl:grid-cols-[1.2fr_.8fr]">
            <div className="grid md:grid-cols-3 xl:border-r xl:border-divider">
              {macro.data.profiles.map((profile) => (
                <section
                  key={profile.country}
                  className="border-b border-r border-divider p-3 last:border-r-0 xl:border-b-0"
                >
                  <div className="flex items-baseline justify-between">
                    <div className="mono-caps text-[9px] text-primary">
                      {profile.country} · {profile.name}
                    </div>
                    <span className="font-mono text-[7px] text-faint">
                      {profile.latest_observation ?? "—"}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {profile.indicators.slice(0, 6).map((indicator) => (
                      <div
                        key={indicator.key}
                        className="grid grid-cols-[1fr_60px_44px] items-center gap-2"
                      >
                        <span className="truncate text-[8px] text-muted-foreground">
                          {indicator.label}
                        </span>
                        <span className="text-right font-mono text-[8px] text-foreground">
                          {indicator.signal.latest == null
                            ? "—"
                            : number(indicator.signal.latest, 1)}
                        </span>
                        <span
                          className={`text-right font-mono text-[7px] ${(indicator.signal.z_score ?? 0) > 0.75 ? "text-down" : (indicator.signal.z_score ?? 0) < -0.75 ? "text-info" : "text-faint"}`}
                        >
                          {indicator.signal.z_score == null
                            ? "—"
                            : `${indicator.signal.z_score >= 0 ? "+" : ""}${indicator.signal.z_score.toFixed(1)}σ`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 border-t border-divider pt-2">
                    {Object.entries(macro.data.factor_impulses[profile.country] ?? {})
                      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                      .slice(0, 3)
                      .map(([factor, impulse]) => (
                        <div
                          key={factor}
                          className="mt-1 flex justify-between mono-caps text-[7px]"
                        >
                          <span className="text-faint">{factor.replaceAll("_", " ")}</span>
                          <span className={impulse >= 0 ? "text-up" : "text-down"}>
                            {impulse >= 0 ? "+" : ""}
                            {impulse.toFixed(2)}
                          </span>
                        </div>
                      ))}
                  </div>
                </section>
              ))}
            </div>
            <div>
              <div className="mono-caps border-b border-divider px-3 py-2 text-[7px] text-primary">
                CONNECTED FINDINGS
              </div>
              <div className="divide-y divide-divider">
                {macro.data.narratives.map((note, index) => (
                  <div key={note} className="grid grid-cols-[24px_1fr] gap-2 px-3 py-2.5">
                    <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
                    <span className="text-[9px] leading-relaxed text-foreground">{note}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-divider p-3 text-[8px] leading-relaxed text-faint">
                {macro.data.methodology}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-3 xl:grid-cols-[1.05fr_.95fr]">
        <Panel
          code="MLS"
          title={`${ticker} · all-model stress matrix`}
          subtitle="Every fitted prediction model is re-scored after identical feature shocks and historical regime slices."
          right={
            <span className="mono-caps text-[8px] text-primary">
              {stress
                ? `${stress.models_tested} MODELS × ${stress.scenarios_tested} SHOCKS`
                : "TRAINING"}
            </span>
          }
        >
          <QueryNotice loading={models.isLoading} error={models.error} />
          {stress && (
            <>
              <div className="grid grid-cols-[100px_74px_72px_80px_1fr] gap-2 border-b border-divider px-3 py-2">
                <Col value="MODEL" />
                <Col value="ROBUST" right />
                <Col value="BASE AUC" right />
                <Col value="MAX FLIP" right />
                <Col value="WORST SHOCK" right />
              </div>
              {stress.robustness_ranking.map((row) => (
                <div
                  key={row.model}
                  className="grid grid-cols-[100px_74px_72px_80px_1fr] items-center gap-2 border-b border-divider/70 px-3 py-2.5"
                >
                  <span className="truncate font-mono text-[8px] text-foreground">{row.model}</span>
                  <span
                    className={`text-right font-mono text-[9px] ${row.robustness_score < 60 ? "text-down" : row.robustness_score < 80 ? "text-primary" : "text-up"}`}
                  >
                    {number(row.robustness_score, 0)}
                  </span>
                  <span className="text-right font-mono text-[8px] text-muted-foreground">
                    {number(row.baseline.roc_auc, 3)}
                  </span>
                  <span className="text-right font-mono text-[8px] text-down">
                    {percent(row.max_flip_rate)}
                  </span>
                  <span className="text-right mono-caps text-[7px] text-primary">
                    {row.worst_scenario}
                  </span>
                </div>
              ))}
              <div className="grid sm:grid-cols-2 lg:grid-cols-3">
                {stress.scenario_summary.map((row) => (
                  <div key={row.scenario} className="border-b border-r border-divider p-3">
                    <div className="mono-caps text-[8px] text-foreground">{row.label}</div>
                    <div className="mt-2 flex justify-between">
                      <Metric
                        label="AUC Δ"
                        value={number(row.mean_auc_change, 3)}
                        down={(row.mean_auc_change ?? 0) < 0}
                      />
                      <Metric
                        label="FLIP RATE"
                        value={percent(row.mean_flip_rate)}
                        down={(row.mean_flip_rate ?? 0) > 0.15}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-divider p-3 text-[8px] leading-relaxed text-faint">
                {stress.methodology}
              </div>
            </>
          )}
        </Panel>

        <Panel
          code="HIS"
          title={`${ticker} · historic structure + analogs`}
          subtitle="Support, resistance, major moves and nearest historical states come from the asset's own OHLCV history."
          right={
            <span className="mono-caps text-[8px] text-info">
              {structure.data?.as_of ?? "LOADING"}
            </span>
          }
        >
          <QueryNotice loading={structure.isLoading} error={structure.error} />
          {structure.data && (
            <>
              <div className="grid grid-cols-3 border-b border-divider">
                <Headline
                  label="TREND"
                  value={structure.data.structure.trend}
                  detail={`RSI ${number(structure.data.structure.rsi14, 0)}`}
                  tone={structure.data.structure.trend === "BEAR" ? "down" : "neutral"}
                />
                <Headline
                  label="VOL REGIME"
                  value={`${number(structure.data.structure.vol_percentile * 100, 0)}TH`}
                  detail={`${percent(structure.data.structure.ann_vol20)} ANN.`}
                />
                <Headline
                  label="52W POSITION"
                  value={number((structure.data.structure.position_52w ?? 0) * 100, 0)}
                  detail={`${percent(structure.data.structure.drawdown)} DRAWDOWN`}
                />
              </div>
              <div className="grid grid-cols-2 border-b border-divider">
                <LevelList title="SUPPORT" rows={structure.data.levels.support} tone="up" />
                <LevelList title="RESISTANCE" rows={structure.data.levels.resistance} tone="down" />
              </div>
              <div className="mono-caps border-b border-divider px-3 py-2 text-[7px] text-primary">
                NEAREST HISTORICAL STATES
              </div>
              <div className="grid grid-cols-[72px_58px_1fr_1fr_1fr] gap-2 border-b border-divider px-3 py-2">
                <Col value="DATE" />
                <Col value="MATCH" right />
                <Col value="FWD 5D" right />
                <Col value="FWD 20D" right />
                <Col value="FWD 60D" right />
              </div>
              {structure.data.historical_analogs.slice(0, 6).map((row) => (
                <div
                  key={row.date}
                  className="grid grid-cols-[72px_58px_1fr_1fr_1fr] gap-2 border-b border-divider/70 px-3 py-2"
                >
                  <span className="font-mono text-[8px] text-foreground">{row.date.slice(2)}</span>
                  <span className="text-right font-mono text-[8px] text-info">
                    {percent(row.similarity)}
                  </span>
                  <Return value={row.forward_5d} />
                  <Return value={row.forward_20d} />
                  <Return value={row.forward_60d} />
                </div>
              ))}
              <div className="border-t border-divider p-3 text-[8px] leading-relaxed text-faint">
                {structure.data.methodology}
              </div>
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Headline({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "primary" | "down";
}) {
  const color =
    tone === "down" ? "text-down" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border-b border-r border-divider p-4 last:border-r-0">
      <div className="mono-caps text-[7px] text-faint">{label}</div>
      <div className={`mt-2 font-mono text-xl ${color}`}>{value}</div>
      <div className="mono-caps mt-1 text-[6px] text-info">{detail}</div>
    </div>
  );
}

function Col({ value, right = false }: { value: string; right?: boolean }) {
  return (
    <span className={`mono-caps text-[6px] text-faint ${right ? "text-right" : ""}`}>{value}</span>
  );
}

function Metric({ label, value, down }: { label: string; value: string; down: boolean }) {
  return (
    <div>
      <div className="mono-caps text-[6px] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-[9px] ${down ? "text-down" : "text-up"}`}>{value}</div>
    </div>
  );
}

function LevelList({ title, rows, tone }: { title: string; rows: Level[]; tone: "up" | "down" }) {
  return (
    <div className="p-3">
      <div className="mono-caps text-[7px] text-primary">{title}</div>
      <div className="mt-2 space-y-2">
        {rows.slice(0, 4).map((row) => (
          <div key={row.price} className="grid grid-cols-[1fr_52px_40px] gap-2">
            <span className={`font-mono text-[9px] ${tone === "up" ? "text-up" : "text-down"}`}>
              ${row.price.toFixed(2)}
            </span>
            <span className="text-right font-mono text-[7px] text-muted-foreground">
              {percent(row.distance_pct)}
            </span>
            <span className="text-right mono-caps text-[6px] text-faint">{row.touches}T</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Return({ value }: { value: number | null }) {
  return (
    <span
      className={`text-right font-mono text-[8px] ${(value ?? 0) >= 0 ? "text-up" : "text-down"}`}
    >
      {percent(value)}
    </span>
  );
}
