import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

type ImpactFlowNode = {
  stage: string;
  title: string;
  detail: string;
};

type ImpactCompany = {
  ticker: string;
  role: string;
  scenario_sensitivity: string;
};

type ImpactAnalysis = {
  id: string;
  headline: string;
  publisher: string;
  published: string;
  url: string;
  event_type: string;
  relevance_label: string;
  causality_label: string;
  sentiment_score: number;
  sentiment_label: "BULLISH" | "BEARISH" | "MIXED";
  materiality: number;
  confidence: number;
  horizon: string;
  flow: ImpactFlowNode[];
  scenarios: { base: string; upside: string; downside: string };
  affected_companies: ImpactCompany[];
};

type ImpactPayload = {
  ticker: string;
  as_of: string;
  signal: {
    label: string;
    score: number;
    bullish_probability: number;
    bearish_probability: number;
    confidence: number;
  };
  evidence: {
    headlines: number;
    provider_tagged: number;
    coverage_pct: number;
  };
  analyses: ImpactAnalysis[];
  methodology: string;
};

function signalTone(label: string) {
  if (label.includes("BULL")) return "text-up";
  if (label.includes("BEAR")) return "text-down";
  return "text-primary";
}

function confidenceTone(value: number) {
  if (value >= 75) return "text-up";
  if (value >= 50) return "text-primary";
  return "text-muted-foreground";
}

export function NewsImpactPanel({ symbol }: { symbol: string }) {
  const impact = useQuery({
    queryKey: ["news-impact", symbol],
    queryFn: () => api<ImpactPayload>(`/news/${encodeURIComponent(symbol)}/impact?limit=12`),
    staleTime: 2 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });

  if (impact.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="mono-caps text-[11px] text-primary">BUILDING EVIDENCE GRAPH · {symbol}</div>
      </div>
    );
  }

  if (impact.isError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-xl border border-down/40 bg-down/5 p-5">
          <div className="mono-caps text-xs text-down">ANALYSIS SERVICE NOT CONNECTED</div>
          <p className="mt-2 text-sm text-muted-foreground">
            {impact.error instanceof Error
              ? impact.error.message
              : "The API did not return an impact graph."}
          </p>
          <button
            type="button"
            onClick={() => impact.refetch()}
            className="mono-caps mt-4 border border-primary px-3 py-1.5 text-[10px] text-primary hover:bg-primary/10"
          >
            RETRY CONNECTION
          </button>
        </div>
      </div>
    );
  }

  const data = impact.data;
  const asOf = new Date(data.as_of);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 grid grid-cols-[1.4fr_repeat(4,minmax(100px,0.6fr))] border-b border-divider bg-panel/95 backdrop-blur">
        <div className="border-r border-divider p-3">
          <div className="mono-caps text-[9px] text-faint">DECISION FRAME · {symbol}</div>
          <div className={`mt-1 font-mono text-xl tabular-nums ${signalTone(data.signal.label)}`}>
            {data.signal.label}
          </div>
          <div className="mono-caps mt-1 text-[9px] text-muted-foreground">
            SCENARIO MODEL · NOT A PRICE FORECAST
          </div>
        </div>
        <Metric label="BULL CASE" value={`${data.signal.bullish_probability}%`} tone="up" />
        <Metric label="BEAR CASE" value={`${data.signal.bearish_probability}%`} tone="down" />
        <Metric label="CONFIDENCE" value={`${data.signal.confidence}%`} />
        <Metric
          label="VERIFIED COVERAGE"
          value={`${data.evidence.provider_tagged}/${data.evidence.headlines}`}
        />
      </div>

      <div className="border-b border-divider px-4 py-2">
        <div className="mono-caps flex flex-wrap items-center gap-x-5 gap-y-1 text-[9px] text-faint">
          <span>PIPELINE: SOURCE → RELEVANCE → CATALYST → TRANSMISSION → KPI → SCENARIO</span>
          <span>AS OF {Number.isNaN(asOf.getTime()) ? data.as_of : asOf.toLocaleString()}</span>
          <span className="text-primary">PROVIDER-TAGGED ≠ PROVEN PRICE CAUSE</span>
        </div>
      </div>

      {!data.analyses.length ? (
        <div className="p-8 text-center">
          <div className="mono-caps text-xs text-primary">NO QUALIFIED CATALYSTS · {symbol}</div>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            The provider returned no sufficiently attributable headlines. The terminal will not
            invent a driver.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-divider">
          {data.analyses.slice(0, 8).map((analysis, index) => (
            <article key={analysis.id} className="p-4">
              <div className="flex items-start justify-between gap-5">
                <div className="min-w-0 flex-1">
                  <div className="mono-caps flex flex-wrap items-center gap-2 text-[9px]">
                    <span className="text-faint">{String(index + 1).padStart(2, "0")}</span>
                    <span className="border border-primary/40 bg-primary/5 px-1.5 py-0.5 text-primary">
                      {analysis.relevance_label}
                    </span>
                    <span
                      className={`border px-1.5 py-0.5 ${
                        analysis.causality_label === "LIKELY DRIVER"
                          ? "border-up/40 bg-up/5 text-up"
                          : analysis.causality_label.includes("NOT CAUSAL")
                            ? "border-faint text-faint"
                            : "border-primary/40 text-primary"
                      }`}
                    >
                      {analysis.causality_label}
                    </span>
                    <span className={signalTone(analysis.sentiment_label)}>
                      {analysis.sentiment_label} {analysis.sentiment_score >= 0 ? "+" : ""}
                      {analysis.sentiment_score.toFixed(2)}
                    </span>
                  </div>
                  {analysis.url ? (
                    <a
                      href={analysis.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block font-serif text-lg leading-snug text-foreground hover:text-primary"
                    >
                      {analysis.headline}
                    </a>
                  ) : (
                    <h3 className="mt-2 font-serif text-lg leading-snug text-foreground">
                      {analysis.headline}
                    </h3>
                  )}
                  <div className="mono-caps mt-1 text-[9px] text-faint">
                    {analysis.publisher} · {analysis.published || "LATEST"} · HORIZON{" "}
                    {analysis.horizon}
                  </div>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right font-mono text-[10px] tabular-nums">
                  <span className="text-faint">MATERIALITY</span>
                  <span className="text-foreground">{analysis.materiality}/100</span>
                  <span className="text-faint">EVIDENCE CONF</span>
                  <span className={confidenceTone(analysis.confidence)}>
                    {analysis.confidence}%
                  </span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-4">
                {analysis.flow.map((node, nodeIndex) => (
                  <div
                    key={`${analysis.id}-${node.stage}`}
                    className="relative border border-border bg-panel p-3"
                  >
                    <div className="mono-caps text-[8px] text-primary">
                      {String(nodeIndex + 1).padStart(2, "0")} · {node.stage}
                    </div>
                    <div className="mt-1 text-xs font-medium text-foreground">{node.title}</div>
                    <div className="mt-1 text-[10px] leading-snug text-muted-foreground">
                      {node.detail}
                    </div>
                    {nodeIndex < analysis.flow.length - 1 && (
                      <span className="absolute -right-2.5 top-1/2 z-[1] hidden -translate-y-1/2 bg-background px-1 text-primary md:block">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.6fr]">
                <div className="border border-border p-3">
                  <div className="mono-caps text-[8px] text-faint">COMPANY TRANSMISSION MAP</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {analysis.affected_companies.map((company) => (
                      <span
                        key={`${analysis.id}-${company.ticker}`}
                        title={`${company.role} · ${company.scenario_sensitivity}`}
                        className={`mono-caps border px-2 py-1 text-[9px] ${
                          company.role === "PRIMARY"
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border text-muted-foreground"
                        }`}
                      >
                        {company.ticker} · {company.role === "PRIMARY" ? "DIRECT" : "2°"}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-[9px] leading-snug text-faint">
                    Second-order names are provider co-mentions, not asserted beneficiaries.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Scenario label="BASE / CONFIRM" text={analysis.scenarios.base} tone="base" />
                  <Scenario label="UPSIDE" text={analysis.scenarios.upside} tone="up" />
                  <Scenario label="DOWNSIDE" text={analysis.scenarios.downside} tone="down" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="border-t border-divider bg-panel px-4 py-3 text-[10px] leading-relaxed text-faint">
        <span className="mono-caps mr-2 text-primary">METHOD</span>
        {data.methodology}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="border-r border-divider p-3 last:border-r-0">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div
        className={`mt-1 font-mono text-lg tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Scenario({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "base" | "up" | "down";
}) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-primary";
  return (
    <div className="border border-border bg-panel p-3">
      <div className={`mono-caps text-[8px] ${color}`}>{label}</div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{text}</p>
    </div>
  );
}
