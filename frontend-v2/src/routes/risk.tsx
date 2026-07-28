import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Panel } from "@/components/terminal/Panel";
import { fmt } from "@/lib/market";
import {
  getBook,
  subscribe,
  applyHedge,
  removeHedge,
  activeHedges,
  resetBook,
  var1d,
  riskContributions,
  netGreeks,
  stress,
  type Book,
  SCENARIOS,
  type Position,
} from "@/lib/book";
import { toast } from "sonner";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk desk — FinSight" },
      {
        name: "description",
        content: "Multi-asset VaR, exposure, stress lab and hedge suggestions.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RiskDeskPro,
});

// Decision-first Risk Desk built around limits, drivers, stress losses, and executable actions.
type ProTab = "OVERVIEW" | "EXPOSURES" | "STRESS" | "HEDGES";
type LimitTone = "CLEAR" | "WATCH" | "BREACH";
type LimitRow = {
  label: string;
  value: number;
  limit: number;
  displayValue: string;
  displayLimit: string;
  utilization: number;
  tone: LimitTone;
};

const RISK_LIMITS = {
  var99Nav: 0.025,
  es99Nav: 0.04,
  stressNav: 0.12,
  grossLeverage: 1.5,
  sectorGross: 0.35,
  positionRisk: 0.25,
};

const SCENARIO_NOTES: Record<string, string> = {
  CRISIS08: "Deep equity and oil selloff with a volatility shock.",
  COVID: "Fast cross-asset liquidation and volatility expansion.",
  RATES100: "Parallel 100bp rate shock with growth-duration pressure.",
  OIL20: "Energy supply shock with mild inflation spillover.",
  TECH15: "Concentrated technology de-rating with higher implied vol.",
};

function money(value: number, digits = 0) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `$${abs.toFixed(digits)}`;
}

function signedMoney(value: number) {
  return `${value < 0 ? "−" : "+"}${money(value)}`;
}

function toneFor(utilization: number): LimitTone {
  if (utilization > 1) return "BREACH";
  if (utilization >= 0.8) return "WATCH";
  return "CLEAR";
}

function toneText(tone: LimitTone) {
  return tone === "BREACH" ? "text-down" : tone === "WATCH" ? "text-primary" : "text-up";
}

function toneBorder(tone: LimitTone) {
  return tone === "BREACH"
    ? "border-down/60 bg-down/5"
    : tone === "WATCH"
      ? "border-primary/50 bg-primary/5"
      : "border-up/30 bg-up/[0.03]";
}

function bookWith(book: Book, extra: Position[]): Book {
  const positions = [...book.positions, ...extra];
  let long = 0;
  let short = 0;
  let pnlDay = 0;
  for (const p of positions) {
    if (p.mv >= 0) long += p.mv;
    else short += p.mv;
    pnlDay += p.pnl;
  }
  return {
    positions,
    nav: book.nav,
    gross: long + Math.abs(short),
    net: long + short,
    long,
    short,
    pnlDay,
    updatedAt: Date.now(),
  };
}

function riskSnapshot(book: Book) {
  const tail99 = var1d(book, "HISTORICAL", 0.99);
  const tail95 = var1d(book, "HISTORICAL", 0.95);
  const contributions = riskContributions(book).sort(
    (a, b) => Math.abs(b.contribPct) - Math.abs(a.contribPct),
  );
  const scenarios = Object.entries(SCENARIOS)
    .map(([key, scenario]) => ({ key, ...scenario, result: stress(book, scenario.shock) }))
    .sort((a, b) => a.result.total - b.result.total);
  const worstScenario = scenarios[0];

  const sectors = new Map<string, number>();
  for (const p of book.positions) {
    const sector = p.sector ?? "Other";
    sectors.set(sector, (sectors.get(sector) ?? 0) + p.gross);
  }
  const topSector = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
  const topSectorPct = book.gross > 0 ? topSector[1] / book.gross : 0;
  const topDriver = contributions.find((item) => item.contribPct > 0) ?? contributions[0];
  const topDriverPct = Math.max(0, topDriver?.contribPct ?? 0);
  const grossLeverage = book.nav > 0 ? book.gross / book.nav : 0;
  const worstLoss = Math.abs(Math.min(0, worstScenario?.result.total ?? 0));

  const limits: LimitRow[] = [
    {
      label: "1D 99% VaR",
      value: tail99.var,
      limit: book.nav * RISK_LIMITS.var99Nav,
      displayValue: money(tail99.var),
      displayLimit: money(book.nav * RISK_LIMITS.var99Nav),
      utilization: tail99.var / (book.nav * RISK_LIMITS.var99Nav || 1),
      tone: toneFor(tail99.var / (book.nav * RISK_LIMITS.var99Nav || 1)),
    },
    {
      label: "99% expected shortfall",
      value: tail99.es,
      limit: book.nav * RISK_LIMITS.es99Nav,
      displayValue: money(tail99.es),
      displayLimit: money(book.nav * RISK_LIMITS.es99Nav),
      utilization: tail99.es / (book.nav * RISK_LIMITS.es99Nav || 1),
      tone: toneFor(tail99.es / (book.nav * RISK_LIMITS.es99Nav || 1)),
    },
    {
      label: "Worst preset stress",
      value: worstLoss,
      limit: book.nav * RISK_LIMITS.stressNav,
      displayValue: money(worstLoss),
      displayLimit: money(book.nav * RISK_LIMITS.stressNav),
      utilization: worstLoss / (book.nav * RISK_LIMITS.stressNav || 1),
      tone: toneFor(worstLoss / (book.nav * RISK_LIMITS.stressNav || 1)),
    },
    {
      label: "Gross leverage",
      value: grossLeverage,
      limit: RISK_LIMITS.grossLeverage,
      displayValue: `${grossLeverage.toFixed(2)}×`,
      displayLimit: `${RISK_LIMITS.grossLeverage.toFixed(2)}×`,
      utilization: grossLeverage / RISK_LIMITS.grossLeverage,
      tone: toneFor(grossLeverage / RISK_LIMITS.grossLeverage),
    },
    {
      label: `${topSector[0]} sector gross`,
      value: topSectorPct,
      limit: RISK_LIMITS.sectorGross,
      displayValue: `${(topSectorPct * 100).toFixed(1)}%`,
      displayLimit: `${(RISK_LIMITS.sectorGross * 100).toFixed(0)}%`,
      utilization: topSectorPct / RISK_LIMITS.sectorGross,
      tone: toneFor(topSectorPct / RISK_LIMITS.sectorGross),
    },
    {
      label: `${topDriver?.pos.symbol ?? "Top position"} risk share`,
      value: topDriverPct,
      limit: RISK_LIMITS.positionRisk,
      displayValue: `${(topDriverPct * 100).toFixed(1)}%`,
      displayLimit: `${(RISK_LIMITS.positionRisk * 100).toFixed(0)}%`,
      utilization: topDriverPct / RISK_LIMITS.positionRisk,
      tone: toneFor(topDriverPct / RISK_LIMITS.positionRisk),
    },
  ];
  const status: LimitTone = limits.some((row) => row.tone === "BREACH")
    ? "BREACH"
    : limits.some((row) => row.tone === "WATCH")
      ? "WATCH"
      : "CLEAR";

  return {
    tail99,
    tail95,
    contributions,
    scenarios,
    worstScenario,
    topSector,
    topSectorPct,
    topDriver,
    grossLeverage,
    limits,
    status,
  };
}

type RiskSnapshot = ReturnType<typeof riskSnapshot>;

function RiskDeskPro() {
  const [tab, setTab] = useState<ProTab>("OVERVIEW");
  const [book, setBook] = useState<Book>(getBook);
  useEffect(() => subscribe(setBook), []);
  const snapshot = useMemo(() => riskSnapshot(book), [book]);
  const activeCount = activeHedges().length;
  const tabs: Array<{ key: ProTab; label: string; meta?: string }> = [
    { key: "OVERVIEW", label: "Overview", meta: snapshot.status },
    { key: "EXPOSURES", label: "Exposures", meta: String(book.positions.length) },
    { key: "STRESS", label: "Stress", meta: String(snapshot.scenarios.length) },
    { key: "HEDGES", label: "Hedges", meta: String(activeCount) },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-divider bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-3 py-3 lg:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4">
              <Link to="/" className="mono-caps text-sm text-primary">
                FinSight
              </Link>
              <div className="h-5 w-px bg-divider" />
              <div>
                <div className="mono-caps text-[11px] text-foreground">Portfolio Risk</div>
                <div className="mono-caps mt-0.5 text-[8px] text-faint">
                  Paper book · modeled estimates
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <HeaderStat label="NAV" value={money(book.nav)} />
              <HeaderStat
                label="DAY P&L"
                value={signedMoney(book.pnlDay)}
                tone={book.pnlDay >= 0 ? "text-up" : "text-down"}
              />
              <div
                className={`mono-caps border px-2.5 py-1 text-[9px] ${toneBorder(snapshot.status)} ${toneText(snapshot.status)}`}
              >
                {snapshot.status === "CLEAR"
                  ? "WITHIN LIMITS"
                  : snapshot.status === "WATCH"
                    ? "LIMIT WATCH"
                    : "LIMIT BREACH"}
              </div>
              <Link
                to="/terminal"
                className="mono-caps hidden text-[9px] text-muted-foreground hover:text-primary sm:block"
              >
                ← Terminal
              </Link>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Risk desk sections">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                aria-current={tab === item.key ? "page" : undefined}
                className={`mono-caps interactive flex min-w-fit items-center gap-2 border px-3 py-1.5 text-[9px] ${
                  tab === item.key
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
                {item.meta && <span className="text-[8px] opacity-70">{item.meta}</span>}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1680px] p-3 lg:p-5">
        <div className="mono-caps mb-3 flex flex-wrap items-center justify-between gap-2 border border-info/25 bg-info/5 px-3 py-2 text-[8px] text-muted-foreground">
          <span>
            <span className="text-info">MODELLED VIEW</span> · deterministic paper book · signed
            exposure correlation proxy · not broker margin
          </span>
          <span>
            AS OF{" "}
            {new Date(book.updatedAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {tab === "OVERVIEW" && <RiskOverview book={book} snapshot={snapshot} onNavigate={setTab} />}
        {tab === "EXPOSURES" && <RiskExposures book={book} snapshot={snapshot} />}
        {tab === "STRESS" && (
          <RiskStress book={book} snapshot={snapshot} onHedge={() => setTab("HEDGES")} />
        )}
        {tab === "HEDGES" && <RiskHedges book={book} snapshot={snapshot} />}
      </main>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="hidden text-right md:block">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`font-mono text-[12px] ${tone}`}>{value}</div>
    </div>
  );
}

function RiskOverview({
  book,
  snapshot,
  onNavigate,
}: {
  book: Book;
  snapshot: RiskSnapshot;
  onNavigate: (tab: ProTab) => void;
}) {
  const worstLoss = Math.abs(Math.min(0, snapshot.worstScenario?.result.total ?? 0));
  const breached = snapshot.limits.filter((row) => row.tone === "BREACH");
  const watched = snapshot.limits.filter((row) => row.tone === "WATCH");
  const headline =
    snapshot.status === "BREACH"
      ? `${breached.length} mandate ${breached.length === 1 ? "limit is" : "limits are"} breached.`
      : snapshot.status === "WATCH"
        ? `${watched.length} limit ${watched.length === 1 ? "is" : "limits are"} inside the watch band.`
        : "The book is operating inside every defined risk limit.";
  const driver = snapshot.topDriver;
  const actions = [
    snapshot.status === "BREACH"
      ? {
          priority: "P1",
          title: `Restore ${breached[0]?.label ?? "risk"} below mandate`,
          note: `${breached[0]?.displayValue} current versus ${breached[0]?.displayLimit} limit. Stop adding gross until resolved.`,
          tab: "HEDGES" as ProTab,
          action: "Review hedges",
        }
      : snapshot.status === "WATCH"
        ? {
            priority: "P1",
            title: `Protect headroom in ${watched[0]?.label ?? "risk budget"}`,
            note: `${watched[0]?.displayValue} current versus ${watched[0]?.displayLimit} limit. Pre-hedge before adding correlated exposure.`,
            tab: "HEDGES" as ProTab,
            action: "Review hedges",
          }
        : {
            priority: "P2",
            title: "Risk budget is available",
            note: "No mandate limit is in the watch band. Keep new risk diversified across existing drivers.",
            tab: "EXPOSURES" as ProTab,
            action: "Inspect exposures",
          },
    {
      priority: "P2",
      title: `${driver?.pos.symbol ?? "Top position"} drives ${((driver?.contribPct ?? 0) * 100).toFixed(1)}% of portfolio VaR`,
      note: `${driver?.pos.sector ?? "Other"} is the first place to size, hedge, or set an invalidation level.`,
      tab: "EXPOSURES" as ProTab,
      action: "Open positions",
    },
    {
      priority: "P2",
      title: `${snapshot.worstScenario?.label ?? "Worst scenario"} is the binding stress`,
      note: `${money(worstLoss)} modeled loss, or ${((worstLoss / book.nav) * 100).toFixed(1)}% of NAV. Review the loss waterfall before the next trade.`,
      tab: "STRESS" as ProTab,
      action: "Open stress",
    },
  ];

  return (
    <div className="space-y-3">
      <Panel
        code="NOW"
        title="Risk posture"
        subtitle="What can hurt the book now, how much capacity remains, and where action is required."
        live
        right={
          <span className={`mono-caps text-[9px] ${toneText(snapshot.status)}`}>
            {snapshot.status}
          </span>
        }
      >
        <div className="grid gap-0 lg:grid-cols-[1.15fr_2fr]">
          <div
            className={`border-b p-5 lg:border-b-0 lg:border-r ${snapshot.status === "BREACH" ? "border-down/40" : snapshot.status === "WATCH" ? "border-primary/30" : "border-up/25"}`}
          >
            <div className={`mono-caps text-[10px] ${toneText(snapshot.status)}`}>
              MANDATE STATUS · {snapshot.status}
            </div>
            <div className="mt-3 max-w-xl font-serif text-3xl leading-tight text-foreground lg:text-4xl">
              {headline}
            </div>
            <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
              {snapshot.status === "CLEAR"
                ? `${money(book.nav * RISK_LIMITS.var99Nav - snapshot.tail99.var)} of 99% VaR headroom remains. The largest avoidable risk is concentration, not total budget.`
                : "Treat breached and watched limits as the work queue. Scenario losses and hedge impact are recalculated from the current paper book."}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            <RiskMetricCard
              label="1D 99% VaR"
              value={`−${money(snapshot.tail99.var)}`}
              detail={`${((snapshot.tail99.var / book.nav) * 100).toFixed(2)}% NAV`}
              tone="down"
            />
            <RiskMetricCard
              label="99% expected shortfall"
              value={`−${money(snapshot.tail99.es)}`}
              detail="average loss beyond VaR"
              tone="down"
            />
            <RiskMetricCard
              label="Worst preset stress"
              value={`−${money(worstLoss)}`}
              detail={snapshot.worstScenario?.label ?? "—"}
              tone="primary"
            />
            <RiskMetricCard
              label="Gross / net"
              value={`${snapshot.grossLeverage.toFixed(2)}×`}
              detail={`${book.net >= 0 ? "+" : "−"}${money(book.net)} net`}
              tone="neutral"
            />
          </div>
        </div>
      </Panel>

      <RiskVisualBoard book={book} snapshot={snapshot} />

      <div className="grid gap-3 xl:grid-cols-[1.35fr_0.85fr]">
        <Panel
          code="DRV"
          title="Ranked risk drivers"
          subtitle="Euler contribution includes correlation and signed hedge effects; negative rows diversify the book."
          right={
            <button
              onClick={() => onNavigate("EXPOSURES")}
              className="mono-caps text-[8px] text-primary hover:text-foreground"
            >
              ALL POSITIONS →
            </button>
          }
        >
          <RiskDriverTable items={snapshot.contributions.slice(0, 8)} nav={book.nav} />
        </Panel>

        <Panel
          code="LIM"
          title="Mandate monitor"
          subtitle="Watch begins at 80% utilization. Limits are explicit and measured against the current NAV."
          right={<span className="mono-caps text-[8px] text-faint">6 CONTROLS</span>}
        >
          <div className="divide-y divide-divider">
            {snapshot.limits.map((row) => (
              <LimitMeter key={row.label} row={row} />
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        code="SCN"
        title="Scenario scan"
        subtitle="Preset shocks are repriced across equity beta, rate duration, commodities, and option Greeks."
        right={
          <button
            onClick={() => onNavigate("STRESS")}
            className="mono-caps text-[8px] text-primary hover:text-foreground"
          >
            OPEN LAB →
          </button>
        }
      >
        <div className="grid sm:grid-cols-2 xl:grid-cols-5">
          {snapshot.scenarios.map((scenario) => (
            <button
              key={scenario.key}
              onClick={() => onNavigate("STRESS")}
              className="interactive border-b border-divider p-4 text-left last:border-b-0 sm:border-r xl:border-b-0"
            >
              <div className="mono-caps text-[9px] text-foreground">{scenario.label}</div>
              <div
                className={`mt-3 font-mono text-xl ${scenario.result.total < 0 ? "text-down" : "text-up"}`}
              >
                {signedMoney(scenario.result.total)}
              </div>
              <div className="mono-caps mt-1 text-[8px] text-faint">
                {((scenario.result.total / book.nav) * 100).toFixed(2)}% NAV
              </div>
              <div className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
                {SCENARIO_NOTES[scenario.key]}
              </div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel
        code="ACT"
        title="Action queue"
        subtitle="Ordered by mandate urgency, then by concentration and stress impact."
      >
        <div className="divide-y divide-divider">
          {actions.map((item) => (
            <div
              key={item.title}
              className="grid items-center gap-3 px-4 py-3 md:grid-cols-[44px_1fr_auto]"
            >
              <div
                className={`mono-caps w-fit border px-2 py-1 text-[8px] ${item.priority === "P1" ? "border-down/50 text-down" : "border-primary/40 text-primary"}`}
              >
                {item.priority}
              </div>
              <div>
                <div className="text-[12px] font-medium text-foreground">{item.title}</div>
                <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                  {item.note}
                </div>
              </div>
              <button
                onClick={() => onNavigate(item.tab)}
                className="mono-caps interactive w-fit border border-border px-3 py-1.5 text-[8px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                {item.action} →
              </button>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function RiskMetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "down" | "primary" | "neutral";
}) {
  const color =
    tone === "down" ? "text-down" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border-b border-r border-divider p-4 last:border-r-0 sm:p-5 lg:border-b-0">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`mt-3 font-mono text-xl lg:text-2xl ${color}`}>{value}</div>
      <div className="mono-caps mt-1.5 text-[8px] leading-relaxed text-muted-foreground">
        {detail}
      </div>
    </div>
  );
}

function RiskDriverTable({
  items,
  nav,
}: {
  items: ReturnType<typeof riskContributions>;
  nav: number;
}) {
  const max = Math.max(...items.map((item) => Math.abs(item.contribPct)), 0.01);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[680px]">
        <div className="mono-caps grid grid-cols-[1.15fr_90px_110px_1fr_90px] gap-3 border-b border-divider bg-raised/40 px-3 py-2 text-[8px] text-faint">
          <span>Position</span>
          <span>Side / class</span>
          <span className="text-right">Market value</span>
          <span>VaR share</span>
          <span className="text-right">Contribution</span>
        </div>
        {items.map((item) => {
          const diversifier = item.contribPct < 0;
          return (
            <div
              key={item.pos.id}
              className="grid grid-cols-[1.15fr_90px_110px_1fr_90px] items-center gap-3 border-b border-divider/60 px-3 py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] text-foreground">{item.pos.symbol}</div>
                <div className="truncate text-[9px] text-faint">{item.pos.sector ?? "Other"}</div>
              </div>
              <div className="mono-caps text-[8px] text-muted-foreground">
                {item.pos.mv >= 0 ? "LONG" : "SHORT"} · {item.pos.cls.slice(0, 3)}
              </div>
              <div
                className={`text-right font-mono text-[10px] ${item.pos.mv >= 0 ? "text-up" : "text-down"}`}
              >
                {signedMoney(item.pos.mv)}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="h-1.5 flex-1 bg-background">
                    <div
                      className={`h-full ${diversifier ? "bg-info" : "bg-primary"}`}
                      style={{
                        width: `${Math.min(100, (Math.abs(item.contribPct) / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <span
                    className={`w-12 text-right font-mono text-[9px] ${diversifier ? "text-info" : "text-foreground"}`}
                  >
                    {(item.contribPct * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
              <div
                className={`text-right font-mono text-[10px] ${diversifier ? "text-info" : "text-down"}`}
              >
                {diversifier ? "−" : "+"}
                {money(item.dollar)}
                <div className="text-[7px] text-faint">
                  {((Math.abs(item.dollar) / nav) * 100).toFixed(2)}% NAV
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LimitMeter({ row }: { row: LimitRow }) {
  const width = Math.min(100, row.utilization * 100);
  const bar = row.tone === "BREACH" ? "bg-down" : row.tone === "WATCH" ? "bg-primary" : "bg-up";
  return (
    <div className="px-4 py-3">
      <div className="mono-caps flex items-center justify-between gap-3 text-[8px]">
        <span className="truncate text-muted-foreground">{row.label}</span>
        <span className={toneText(row.tone)}>{row.tone}</span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-1.5 flex-1 bg-background">
          <div className={`h-full ${bar}`} style={{ width: `${width}%` }} />
        </div>
        <span className="w-12 text-right font-mono text-[9px] text-foreground">
          {(row.utilization * 100).toFixed(0)}%
        </span>
      </div>
      <div className="mono-caps mt-1.5 flex justify-between text-[7px] text-faint">
        <span>{row.displayValue} current</span>
        <span>{row.displayLimit} limit</span>
      </div>
    </div>
  );
}

function RiskExposures({ book, snapshot }: { book: Book; snapshot: RiskSnapshot }) {
  const [sort, setSort] = useState<"RISK" | "GROSS" | "PNL">("RISK");
  const contributions = new Map(snapshot.contributions.map((item) => [item.pos.id, item]));
  const positions = [...book.positions].sort((a, b) => {
    if (sort === "GROSS") return b.gross - a.gross;
    if (sort === "PNL") return Math.abs(b.pnl) - Math.abs(a.pnl);
    return (
      Math.abs(contributions.get(b.id)?.contribPct ?? 0) -
      Math.abs(contributions.get(a.id)?.contribPct ?? 0)
    );
  });
  const bySector = groupExposure(book.positions, (p) => p.sector ?? "Other");
  const byClass = groupExposure(book.positions, (p) => p.cls);
  const greeks = netGreeks(book);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExposureSummary
          label="Gross exposure"
          value={money(book.gross)}
          detail={`${snapshot.grossLeverage.toFixed(2)}× NAV`}
        />
        <ExposureSummary
          label="Net exposure"
          value={`${book.net >= 0 ? "+" : "−"}${money(book.net)}`}
          detail={`${((book.net / book.nav) * 100).toFixed(1)}% net`}
          tone={book.net >= 0 ? "up" : "down"}
        />
        <ExposureSummary
          label="Largest sector"
          value={snapshot.topSector[0]}
          detail={`${(snapshot.topSectorPct * 100).toFixed(1)}% of gross`}
          tone={snapshot.topSectorPct > RISK_LIMITS.sectorGross ? "down" : "neutral"}
        />
        <ExposureSummary
          label="Top VaR driver"
          value={snapshot.topDriver?.pos.symbol ?? "—"}
          detail={`${((snapshot.topDriver?.contribPct ?? 0) * 100).toFixed(1)}% of VaR`}
          tone={
            (snapshot.topDriver?.contribPct ?? 0) > RISK_LIMITS.positionRisk ? "down" : "neutral"
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel
          code="SEC"
          title="Sector exposure"
          subtitle="Signed market value against gross exposure; the marker shows the 35% concentration limit."
        >
          <ExposureBars rows={bySector} gross={book.gross} />
        </Panel>
        <Panel
          code="CLS"
          title="Asset-class exposure"
          subtitle="Long and short notional are shown separately so offsets stay visible."
        >
          <ExposureBars rows={byClass} gross={book.gross} />
        </Panel>
      </div>

      <Panel
        code="POS"
        title={`Position risk register · ${positions.length}`}
        subtitle="Every position ranked by modeled risk, gross notional, or absolute P&L. Diversifiers retain a negative VaR share."
        right={
          <div className="flex gap-1">
            {(["RISK", "GROSS", "PNL"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`mono-caps border px-2 py-1 text-[7px] ${sort === key ? "border-primary bg-primary/10 text-primary" : "border-border text-faint"}`}
              >
                {key}
              </button>
            ))}
          </div>
        }
      >
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="mono-caps grid grid-cols-[1.45fr_80px_80px_110px_90px_80px_90px_100px] gap-3 border-b border-divider bg-raised/40 px-3 py-2 text-[8px] text-faint">
              <span>Position</span>
              <span>Class</span>
              <span>Side</span>
              <span className="text-right">Market value</span>
              <span className="text-right">Book weight</span>
              <span className="text-right">Ann. vol</span>
              <span className="text-right">VaR share</span>
              <span className="text-right">Open P&L</span>
            </div>
            {positions.map((position) => {
              const contribution = contributions.get(position.id);
              const diversifier = (contribution?.contribPct ?? 0) < 0;
              return (
                <div
                  key={position.id}
                  className="grid grid-cols-[1.45fr_80px_80px_110px_90px_80px_90px_100px] items-center gap-3 border-b border-divider/60 px-3 py-2.5 last:border-b-0 hover:bg-raised/40"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-foreground">{position.symbol}</div>
                    <div className="truncate text-[9px] text-faint">
                      {position.name} · {position.sector ?? "Other"}
                    </div>
                  </div>
                  <span className="mono-caps text-[8px] text-muted-foreground">{position.cls}</span>
                  <span
                    className={`mono-caps text-[8px] ${position.mv >= 0 ? "text-up" : "text-down"}`}
                  >
                    {position.mv >= 0 ? "LONG" : "SHORT"}
                  </span>
                  <span
                    className={`text-right font-mono text-[10px] ${position.mv >= 0 ? "text-up" : "text-down"}`}
                  >
                    {signedMoney(position.mv)}
                  </span>
                  <span className="text-right font-mono text-[10px] text-foreground">
                    {((position.gross / book.gross) * 100).toFixed(1)}%
                  </span>
                  <span className="text-right font-mono text-[10px] text-muted-foreground">
                    {(position.vol * 100).toFixed(1)}%
                  </span>
                  <span
                    className={`text-right font-mono text-[10px] ${diversifier ? "text-info" : "text-primary"}`}
                  >
                    {((contribution?.contribPct ?? 0) * 100).toFixed(1)}%
                  </span>
                  <span
                    className={`text-right font-mono text-[10px] ${position.pnl >= 0 ? "text-up" : "text-down"}`}
                  >
                    {signedMoney(position.pnl)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel
        code="GRK"
        title="Option Greeks"
        subtitle="Aggregate sensitivity from option positions only; dollar delta is converted into the portfolio risk model through underlier notional."
      >
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {[
            { label: "DELTA", value: greeks.delta, digits: 0 },
            { label: "GAMMA", value: greeks.gamma, digits: 2 },
            { label: "VEGA / VOL PT", value: greeks.vega, digits: 0 },
            { label: "THETA / DAY", value: greeks.theta, digits: 0 },
          ].map((item) => (
            <div
              key={item.label}
              className="border-b border-r border-divider p-4 last:border-r-0 sm:border-b-0"
            >
              <div className="mono-caps text-[8px] text-faint">{item.label}</div>
              <div
                className={`mt-2 font-mono text-xl ${item.value >= 0 ? "text-up" : "text-down"}`}
              >
                {item.value >= 0 ? "+" : ""}
                {fmt(item.value, item.digits)}
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function groupExposure(positions: Position[], key: (position: Position) => string) {
  const groups = new Map<
    string,
    { label: string; long: number; short: number; gross: number; net: number }
  >();
  for (const position of positions) {
    const label = key(position);
    const row = groups.get(label) ?? { label, long: 0, short: 0, gross: 0, net: 0 };
    if (position.mv >= 0) row.long += position.mv;
    else row.short += Math.abs(position.mv);
    row.gross += position.gross;
    row.net += position.mv;
    groups.set(label, row);
  }
  return [...groups.values()].sort((a, b) => b.gross - a.gross);
}

function ExposureSummary({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "up" | "down" | "neutral";
}) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="panel p-4">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`mt-2 truncate font-mono text-xl ${color}`}>{value}</div>
      <div className="mono-caps mt-1 text-[8px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ExposureBars({ rows, gross }: { rows: ReturnType<typeof groupExposure>; gross: number }) {
  const max = Math.max(...rows.map((row) => Math.max(row.long, row.short)), 1);
  return (
    <div className="divide-y divide-divider">
      {rows.map((row) => {
        const grossPct = gross > 0 ? row.gross / gross : 0;
        return (
          <div
            key={row.label}
            className="grid grid-cols-[100px_1fr_64px] items-center gap-3 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="mono-caps truncate text-[8px] text-foreground">{row.label}</div>
              <div className={`font-mono text-[8px] ${row.net >= 0 ? "text-up" : "text-down"}`}>
                {row.net >= 0 ? "+" : "−"}
                {money(row.net)} net
              </div>
            </div>
            <div className="relative grid h-3 grid-cols-2 bg-background">
              <div className="relative border-r border-divider">
                <div
                  className="absolute right-0 h-full bg-down/70"
                  style={{ width: `${(row.short / max) * 100}%` }}
                />
              </div>
              <div className="relative">
                <div
                  className="absolute left-0 h-full bg-up/70"
                  style={{ width: `${(row.long / max) * 100}%` }}
                />
              </div>
            </div>
            <div
              className={`text-right font-mono text-[9px] ${grossPct > RISK_LIMITS.sectorGross ? "text-down" : "text-muted-foreground"}`}
            >
              {(grossPct * 100).toFixed(1)}%
            </div>
          </div>
        );
      })}
      <div className="mono-caps flex justify-between px-3 py-2 text-[7px] text-faint">
        <span>← SHORT</span>
        <span>LONG →</span>
      </div>
    </div>
  );
}

function RiskStress({
  book,
  snapshot,
  onHedge,
}: {
  book: Book;
  snapshot: RiskSnapshot;
  onHedge: () => void;
}) {
  const [scenarioKey, setScenarioKey] = useState(snapshot.worstScenario?.key ?? "CRISIS08");
  const [custom, setCustom] = useState({
    equityPct: -0.12,
    ratesBp: 75,
    oilPct: -0.1,
    volMult: 1.8,
  });
  const isCustom = scenarioKey === "CUSTOM";
  const shock = useMemo(
    () => (isCustom ? custom : (SCENARIOS[scenarioKey]?.shock ?? SCENARIOS.CRISIS08.shock)),
    [custom, isCustom, scenarioKey],
  );
  const result = useMemo(() => stress(book, shock), [book, shock]);
  const sorted = [...result.byPos].sort((a, b) => a.pnl - b.pnl);
  const worstPosition = sorted[0];
  const loss = Math.abs(Math.min(0, result.total));
  const budget = book.nav * RISK_LIMITS.stressNav;
  const utilization = loss / (budget || 1);
  const tone = toneFor(utilization);
  const selectedLabel = isCustom
    ? "CUSTOM SCENARIO"
    : (SCENARIOS[scenarioKey]?.label ?? "SCENARIO");

  return (
    <div className="grid gap-3 xl:grid-cols-[310px_1fr]">
      <Panel
        code="SCN"
        title="Scenario library"
        subtitle="Select a preset or build a custom cross-asset shock."
      >
        <div className="divide-y divide-divider">
          {Object.entries(SCENARIOS).map(([key, scenario]) => {
            const preset = snapshot.scenarios.find((item) => item.key === key);
            return (
              <button
                key={key}
                onClick={() => setScenarioKey(key)}
                className={`interactive w-full p-3 text-left ${scenarioKey === key ? "bg-primary/10" : "hover:bg-raised"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`mono-caps text-[9px] ${scenarioKey === key ? "text-primary" : "text-foreground"}`}
                  >
                    {scenario.label}
                  </span>
                  <span
                    className={`font-mono text-[9px] ${(preset?.result.total ?? 0) < 0 ? "text-down" : "text-up"}`}
                  >
                    {signedMoney(preset?.result.total ?? 0)}
                  </span>
                </div>
                <div className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
                  {SCENARIO_NOTES[key]}
                </div>
              </button>
            );
          })}
          <button
            onClick={() => setScenarioKey("CUSTOM")}
            className={`interactive w-full p-3 text-left ${isCustom ? "bg-primary/10" : "hover:bg-raised"}`}
          >
            <div
              className={`mono-caps text-[9px] ${isCustom ? "text-primary" : "text-foreground"}`}
            >
              CUSTOM SHOCK
            </div>
            <div className="mt-1 text-[9px] text-muted-foreground">
              Set equity, rates, oil, and volatility moves.
            </div>
          </button>
        </div>
        {isCustom && (
          <div className="space-y-4 border-t border-divider bg-raised/30 p-3">
            <RiskSlider
              label="EQUITY SHOCK"
              value={custom.equityPct * 100}
              min={-40}
              max={20}
              step={1}
              format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
              onChange={(v) => setCustom({ ...custom, equityPct: v / 100 })}
            />
            <RiskSlider
              label="RATES Δ"
              value={custom.ratesBp}
              min={-200}
              max={200}
              step={5}
              format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}bp`}
              onChange={(v) => setCustom({ ...custom, ratesBp: v })}
            />
            <RiskSlider
              label="OIL SHOCK"
              value={custom.oilPct * 100}
              min={-50}
              max={50}
              step={1}
              format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`}
              onChange={(v) => setCustom({ ...custom, oilPct: v / 100 })}
            />
            <RiskSlider
              label="VOL MULTIPLIER"
              value={custom.volMult}
              min={0.5}
              max={4}
              step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              onChange={(v) => setCustom({ ...custom, volMult: v })}
            />
          </div>
        )}
      </Panel>

      <div className="space-y-3">
        <Panel
          code="IMP"
          title={selectedLabel}
          subtitle="Estimated instantaneous P&L after repricing each position under the selected shock."
          right={<span className={`mono-caps text-[9px] ${toneText(tone)}`}>{tone}</span>}
        >
          <div className="grid lg:grid-cols-[1.25fr_2fr]">
            <div className={`border-b p-5 lg:border-b-0 lg:border-r ${toneBorder(tone)}`}>
              <div className="mono-caps text-[8px] text-faint">MODELED PORTFOLIO IMPACT</div>
              <div
                className={`mt-2 font-mono text-4xl lg:text-5xl ${result.total < 0 ? "text-down" : "text-up"}`}
              >
                {signedMoney(result.total)}
              </div>
              <div className="mono-caps mt-2 text-[9px] text-muted-foreground">
                {((result.total / book.nav) * 100).toFixed(2)}% NAV · POST-SHOCK{" "}
                {money(book.nav + result.total)}
              </div>
              <button
                onClick={onHedge}
                className="mono-caps interactive mt-5 border border-primary px-3 py-2 text-[8px] text-primary hover:bg-primary/10"
              >
                Review hedge actions →
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <StressMetric
                label="Stress budget"
                value={money(budget)}
                detail={`${(RISK_LIMITS.stressNav * 100).toFixed(0)}% NAV`}
              />
              <StressMetric
                label="Utilization"
                value={`${(utilization * 100).toFixed(0)}%`}
                detail={tone}
                tone={tone === "BREACH" ? "down" : tone === "WATCH" ? "primary" : "neutral"}
              />
              <StressMetric
                label="Worst driver"
                value={worstPosition?.pos.symbol ?? "—"}
                detail={worstPosition ? `−${money(worstPosition.pnl)}` : "—"}
                tone="down"
              />
              <StressMetric
                label="1D 99% VaR"
                value={`−${money(snapshot.tail99.var)}`}
                detail="current, pre-shock"
                tone="down"
              />
            </div>
            <div className="mono-caps col-span-full grid grid-cols-2 border-t border-divider bg-raised/25 text-[8px] sm:grid-cols-4">
              <ShockCell
                label="EQUITY"
                value={`${(shock.equityPct ?? 0) >= 0 ? "+" : ""}${((shock.equityPct ?? 0) * 100).toFixed(0)}%`}
              />
              <ShockCell
                label="RATES"
                value={`${(shock.ratesBp ?? 0) >= 0 ? "+" : ""}${(shock.ratesBp ?? 0).toFixed(0)}bp`}
              />
              <ShockCell
                label="OIL"
                value={`${(shock.oilPct ?? 0) >= 0 ? "+" : ""}${((shock.oilPct ?? 0) * 100).toFixed(0)}%`}
              />
              <ShockCell label="VOL" value={`${(shock.volMult ?? 1).toFixed(1)}×`} />
            </div>
          </div>
        </Panel>

        <Panel
          code="WFL"
          title="Loss waterfall"
          subtitle="Largest modeled loss contributors first; gains and hedges are shown on the right."
        >
          <StressLossTable rows={sorted} total={result.total} />
        </Panel>
      </div>
    </div>
  );
}

function StressMetric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "down" | "primary" | "neutral";
}) {
  const color =
    tone === "down" ? "text-down" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border-b border-r border-divider p-4 last:border-r-0 lg:border-b-0">
      <div className="mono-caps text-[8px] text-faint">{label}</div>
      <div className={`mt-2 truncate font-mono text-xl ${color}`}>{value}</div>
      <div className="mono-caps mt-1 text-[7px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function ShockCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-r border-divider px-4 py-2.5 last:border-r-0">
      <span className="text-faint">{label}</span>
      <span className="font-mono text-primary">{value}</span>
    </div>
  );
}

function StressLossTable({
  rows,
  total,
}: {
  rows: { pos: Position; pnl: number }[];
  total: number;
}) {
  const max = Math.max(...rows.map((row) => Math.abs(row.pnl)), 1);
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        {rows.map((row) => {
          const isLoss = row.pnl < 0;
          const width = (Math.abs(row.pnl) / max) * 100;
          return (
            <div
              key={row.pos.id}
              className="grid grid-cols-[140px_1fr_100px] items-center gap-3 border-b border-divider/60 px-3 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="font-mono text-[10px] text-foreground">{row.pos.symbol}</div>
                <div className="truncate text-[8px] text-faint">
                  {row.pos.sector ?? row.pos.cls}
                </div>
              </div>
              <div className="grid h-3 grid-cols-2 bg-background">
                <div className="relative border-r border-divider">
                  {isLoss && (
                    <div
                      className="absolute right-0 h-full bg-down/80"
                      style={{ width: `${width}%` }}
                    />
                  )}
                </div>
                <div className="relative">
                  {!isLoss && (
                    <div
                      className="absolute left-0 h-full bg-up/80"
                      style={{ width: `${width}%` }}
                    />
                  )}
                </div>
              </div>
              <span
                className={`text-right font-mono text-[10px] ${isLoss ? "text-down" : "text-up"}`}
              >
                {signedMoney(row.pnl)}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-[140px_1fr_100px] gap-3 bg-raised/40 px-3 py-3">
          <span className="mono-caps text-[9px] text-foreground">TOTAL IMPACT</span>
          <span />
          <span
            className={`text-right font-mono text-[11px] ${total < 0 ? "text-down" : "text-up"}`}
          >
            {signedMoney(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

type HedgeCandidate = {
  id: string;
  title: string;
  thesis: string;
  tradeoff: string;
  premium: number;
  positions: Position[];
};

function RiskHedges({ book, snapshot }: { book: Book; snapshot: RiskSnapshot }) {
  const [active, setActive] = useState<Set<string>>(new Set(activeHedges()));
  const candidates = useMemo(() => buildHedgeCandidates(book, snapshot), [book, snapshot]);
  const scored = useMemo(
    () =>
      candidates
        .map((candidate) => {
          const projectedBook = bookWith(book, candidate.positions);
          const projectedVar = var1d(projectedBook, "HISTORICAL", 0.99).var;
          const currentStress = Math.min(0, snapshot.worstScenario?.result.total ?? 0);
          const projectedStress = snapshot.worstScenario
            ? Math.min(0, stress(projectedBook, snapshot.worstScenario.shock).total)
            : currentStress;
          return {
            ...candidate,
            projectedVar,
            projectedStress,
            varReduction:
              snapshot.tail99.var > 0
                ? (snapshot.tail99.var - projectedVar) / snapshot.tail99.var
                : 0,
            stressReduction:
              Math.abs(currentStress) > 0
                ? (Math.abs(currentStress) - Math.abs(projectedStress)) / Math.abs(currentStress)
                : 0,
          };
        })
        .sort((a, b) => b.varReduction - a.varReduction),
    [book, candidates, snapshot],
  );

  function toggle(candidate: HedgeCandidate) {
    if (active.has(candidate.id)) {
      removeHedge(candidate.id);
      setActive(new Set(activeHedges()));
      toast(`Removed paper hedge · ${candidate.title}`);
    } else {
      applyHedge(candidate.id, candidate.positions);
      setActive(new Set(activeHedges()));
      toast.success(`Applied to paper book · ${candidate.title}`);
    }
  }

  function reset() {
    resetBook();
    setActive(new Set());
    toast("Paper hedge overlays cleared");
  }

  return (
    <div className="space-y-3">
      <Panel
        code="LIVE"
        title="Live hedge state"
        subtitle="Current modeled risk after every active paper-book overlay."
        live
        right={<span className="mono-caps text-[8px] text-primary">{active.size} ACTIVE</span>}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4">
          <RiskMetricCard
            label="1D 99% VaR"
            value={`−${money(snapshot.tail99.var)}`}
            detail={`${((snapshot.tail99.var / book.nav) * 100).toFixed(2)}% NAV`}
            tone="down"
          />
          <RiskMetricCard
            label="Expected shortfall"
            value={`−${money(snapshot.tail99.es)}`}
            detail="beyond 99% VaR"
            tone="down"
          />
          <RiskMetricCard
            label="Worst stress"
            value={`−${money(Math.abs(Math.min(0, snapshot.worstScenario?.result.total ?? 0)))}`}
            detail={snapshot.worstScenario?.label ?? "—"}
            tone="primary"
          />
          <RiskMetricCard
            label="Gross exposure"
            value={money(book.gross)}
            detail={`${snapshot.grossLeverage.toFixed(2)}× NAV`}
            tone="neutral"
          />
        </div>
      </Panel>

      <Panel
        code="HDG"
        title={`Ranked hedge actions · ${scored.length}`}
        subtitle="Impact is recalculated from signed exposure and scenario repricing; it is not a hard-coded discount."
        right={
          <button
            onClick={reset}
            className="mono-caps text-[8px] text-muted-foreground hover:text-primary"
          >
            CLEAR OVERLAYS
          </button>
        }
      >
        <div className="divide-y divide-divider">
          {scored.map((candidate, index) => {
            const isOn = active.has(candidate.id);
            const improvesVar = candidate.varReduction > 0;
            return (
              <div key={candidate.id} className={`p-4 ${isOn ? "bg-primary/5" : ""}`}>
                <div className="grid gap-4 lg:grid-cols-[54px_1.25fr_1fr_auto] lg:items-center">
                  <div className="mono-caps flex h-9 w-9 items-center justify-center border border-border text-[9px] text-faint">
                    0{index + 1}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[13px] font-medium text-foreground">
                        {candidate.title}
                      </div>
                      {isOn && (
                        <span className="mono-caps border border-primary/50 bg-primary/10 px-1.5 py-0.5 text-[7px] text-primary">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                      {candidate.thesis}
                    </div>
                    <div className="mono-caps mt-2 text-[7px] text-faint">
                      TRADE-OFF · {candidate.tradeoff}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <HedgeImpact
                      label="99% VaR after"
                      value={isOn ? "LIVE" : `−${money(candidate.projectedVar)}`}
                      detail={
                        isOn
                          ? "reflected above"
                          : `${candidate.varReduction >= 0 ? "−" : "+"}${Math.abs(candidate.varReduction * 100).toFixed(0)}%`
                      }
                      tone={improvesVar ? "up" : "down"}
                    />
                    <HedgeImpact
                      label="Stress effect"
                      value={
                        isOn
                          ? "LIVE"
                          : `${candidate.stressReduction >= 0 ? "−" : "+"}${Math.abs(candidate.stressReduction * 100).toFixed(0)}%`
                      }
                      detail="worst preset"
                      tone={candidate.stressReduction >= 0 ? "up" : "down"}
                    />
                    <HedgeImpact
                      label="Premium"
                      value={candidate.premium > 0 ? money(candidate.premium) : "$0"}
                      detail={candidate.premium > 0 ? "upfront" : "notional hedge"}
                      tone="neutral"
                    />
                  </div>
                  <button
                    onClick={() => toggle(candidate)}
                    className={`mono-caps interactive min-w-24 border px-4 py-2 text-[8px] ${isOn ? "border-primary bg-primary text-primary-foreground" : "border-primary text-primary hover:bg-primary/10"}`}
                  >
                    {isOn ? "REMOVE" : "APPLY"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          code="ORD"
          title="Execution note"
          subtitle="These controls modify the local paper book only."
        >
          <div className="p-4 text-[11px] leading-relaxed text-muted-foreground">
            No broker order is sent. Premium, slippage, margin, basis risk, and liquidity are not
            included in the projected impact. Revalidate size against the live instrument before
            execution.
          </div>
        </Panel>
        <Panel
          code="GOV"
          title="Hedge governance"
          subtitle="Use the smallest action that restores headroom without creating a new concentration."
        >
          <div className="grid grid-cols-3 divide-x divide-divider">
            <GovernanceStep number="01" label="Restore" note="Bring breached limits below 80%." />
            <GovernanceStep number="02" label="Re-test" note="Run the binding stress again." />
            <GovernanceStep number="03" label="Monitor" note="Set an exit or rebalance trigger." />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function buildHedgeCandidates(book: Book, snapshot: RiskSnapshot): HedgeCandidate[] {
  const candidates: HedgeCandidate[] = [];
  const equityBeta = book.positions.reduce((sum, position) => {
    if (position.cls === "COMMODITY") return sum;
    return sum + (position.riskNotional ?? position.mv) * (position.beta ?? 1);
  }, 0);

  if (Math.abs(equityBeta) > 250_000) {
    const contractNotional = 5_500 * 50;
    const qty = -Math.round(equityBeta / contractNotional);
    if (qty !== 0) {
      candidates.push({
        id: "BETA-ES",
        title: `${qty < 0 ? "Short" : "Long"} ${Math.abs(qty)} ES future${Math.abs(qty) === 1 ? "" : "s"}`,
        thesis: "Neutralizes broad equity beta while leaving single-name positions intact.",
        tradeoff:
          "Basis and roll risk; futures can raise gross notional even as correlated risk falls.",
        premium: 0,
        positions: [
          {
            id: "HDG-BETA-ES",
            cls: "COMMODITY",
            symbol: "ES",
            name: "E-mini S&P 500 beta hedge",
            qty,
            entry: 5_500,
            mark: 5_500,
            pnl: 0,
            mv: qty * contractNotional,
            gross: Math.abs(qty * contractNotional),
            sector: "Broad",
            beta: 1,
            vol: 0.16,
            riskNotional: qty * contractNotional,
            underlier: "SPY",
          },
        ],
      });
    }
  }

  candidates.push({
    id: "TAIL-SPY",
    title: "Buy 10 SPY 590 puts · 30D",
    thesis:
      "Adds convex downside protection to reduce gap risk and cushion the binding equity stress.",
    tradeoff: "Premium decays daily; protection weakens if expiry passes before the shock.",
    premium: 4_200,
    positions: [
      {
        id: "HDG-TAIL-SPY",
        cls: "OPTION",
        symbol: "SPY P590 30D",
        name: "SPY downside tail hedge",
        qty: 10,
        entry: 4.2,
        mark: 4.2,
        pnl: 0,
        mv: 4_200,
        gross: 4_200,
        sector: "Options",
        beta: 1,
        vol: 0.16,
        riskNotional: -214_200,
        underlier: "SPY",
        underlyingMark: 612,
        optType: "P",
        strike: 590,
        daysToExpiry: 30,
        delta: -350,
        gamma: 45,
        vega: 120,
        theta: -35,
      },
    ],
  });

  const driver = snapshot.topDriver;
  if (driver) {
    const source = driver.pos;
    const scale = -0.25;
    candidates.push({
      id: `TRIM-${source.id}`,
      title: `Reduce ${source.symbol} by 25%`,
      thesis: `Directly cuts the book's largest modeled VaR contributor and releases concentration headroom.`,
      tradeoff:
        "Realizes exposure and may reduce upside participation or close a deliberate hedge.",
      premium: 0,
      positions: [
        {
          ...source,
          id: `HDG-TRIM-${source.id}`,
          name: `${source.name} · 25% risk reduction`,
          qty: source.qty * scale,
          pnl: 0,
          mv: source.mv * scale,
          gross: Math.abs(source.mv * scale),
          riskNotional: (source.riskNotional ?? source.mv) * scale,
          delta: source.delta === undefined ? undefined : source.delta * scale,
          gamma: source.gamma === undefined ? undefined : source.gamma * scale,
          vega: source.vega === undefined ? undefined : source.vega * scale,
          theta: source.theta === undefined ? undefined : source.theta * scale,
        },
      ],
    });
  }

  return candidates;
}

function HedgeImpact({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "up" | "down" | "neutral";
}) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-foreground";
  return (
    <div className="border border-divider bg-background p-2">
      <div className="mono-caps text-[7px] text-faint">{label}</div>
      <div className={`mt-1 font-mono text-[11px] ${color}`}>{value}</div>
      <div className="mono-caps mt-0.5 text-[6px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function GovernanceStep({ number, label, note }: { number: string; label: string; note: string }) {
  return (
    <div className="p-4">
      <div className="mono-caps text-[8px] text-primary">
        {number} · {label}
      </div>
      <div className="mt-2 text-[9px] leading-relaxed text-muted-foreground">{note}</div>
    </div>
  );
}

function RiskSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
}) {
  return (
    <label className="block">
      <span className="mono-caps flex justify-between text-[8px] text-faint">
        <span>{label}</span>
        <span className="text-primary">{format(value)}</span>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-2 w-full accent-primary"
      />
    </label>
  );
}

function RiskVisualBoard({ book, snapshot }: { book: Book; snapshot: RiskSnapshot }) {
  const lossScale = Math.max(snapshot.tail99.es * 1.18, snapshot.tail99.var, 1);
  const var95Pct = Math.min(100, (snapshot.tail95.var / lossScale) * 100);
  const var99Pct = Math.min(100, (snapshot.tail99.var / lossScale) * 100);
  const es99Pct = Math.min(100, (snapshot.tail99.es / lossScale) * 100);
  const positiveDrivers = snapshot.contributions.filter((item) => item.contribPct > 0).slice(0, 7);
  const positiveTotal = positiveDrivers.reduce((sum, item) => sum + item.contribPct, 0) || 1;
  const maxScenario = Math.max(
    ...snapshot.scenarios.map((scenario) => Math.abs(scenario.result.total)),
    1,
  );

  return (
    <Panel
      code="MAP"
      title="Risk geometry"
      subtitle="The book translated into tail distance, concentration structure, and cross-scenario loss shape."
      right={<span className="mono-caps text-[8px] text-info">LIVE MODEL MAP</span>}
    >
      <div className="grid xl:grid-cols-[1.25fr_1fr_1fr]">
        <section className="border-b border-divider p-4 xl:border-b-0 xl:border-r">
          <div className="mono-caps flex items-center justify-between text-[8px] text-faint">
            <span>TAIL LOSS ENVELOPE · 1 DAY</span>
            <span>{money(lossScale)} SCALE</span>
          </div>
          <div className="relative mt-8 h-20">
            <div className="absolute inset-x-0 top-5 h-3 overflow-hidden border border-divider bg-background">
              <div
                className="h-full"
                style={{
                  width: `${es99Pct}%`,
                  background:
                    "linear-gradient(90deg, rgba(66,201,139,.65), rgba(240,169,41,.75) 58%, rgba(240,100,100,.9))",
                }}
              />
            </div>
            <TailMarker
              left={var95Pct}
              label="95% VAR"
              value={money(snapshot.tail95.var)}
              tone="primary"
            />
            <TailMarker
              left={var99Pct}
              label="99% VAR"
              value={money(snapshot.tail99.var)}
              tone="down"
            />
            <TailMarker
              left={es99Pct}
              label="99% ES"
              value={money(snapshot.tail99.es)}
              tone="info"
            />
            <div className="mono-caps absolute inset-x-0 bottom-0 flex justify-between text-[7px] text-faint">
              <span>$0 LOSS</span>
              <span>FURTHER INTO TAIL →</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 border border-divider bg-raised/30">
            <VisualStat
              label="VAR / NAV"
              value={`${((snapshot.tail99.var / book.nav) * 100).toFixed(2)}%`}
            />
            <VisualStat
              label="TAIL GAP"
              value={`+${((snapshot.tail99.es / snapshot.tail99.var - 1) * 100).toFixed(0)}%`}
            />
            <VisualStat
              label="HEADROOM"
              value={money(Math.max(0, book.nav * RISK_LIMITS.var99Nav - snapshot.tail99.var))}
            />
          </div>
        </section>

        <section className="border-b border-divider p-4 xl:border-b-0 xl:border-r">
          <div className="mono-caps flex items-center justify-between text-[8px] text-faint">
            <span>CONCENTRATION STACK</span>
            <span>POSITIVE VAR CONTRIBUTORS</span>
          </div>
          <div className="mt-5 flex h-12 overflow-hidden border border-background bg-background">
            {positiveDrivers.map((item, index) => {
              const width = (item.contribPct / positiveTotal) * 100;
              const colors = [
                "#F06464",
                "#F0A929",
                "#45B9D3",
                "#8A631F",
                "#42C98B",
                "#636C74",
                "#9AA2A9",
              ];
              return (
                <div
                  key={item.pos.id}
                  className="relative h-full border-r border-background/70"
                  style={{ width: `${width}%`, backgroundColor: colors[index % colors.length] }}
                  title={`${item.pos.symbol} · ${(item.contribPct * 100).toFixed(1)}% of VaR`}
                >
                  {width >= 9 && (
                    <div className="absolute inset-0 flex flex-col justify-center px-2 text-black/80">
                      <span className="mono-caps text-[8px] font-bold">{item.pos.symbol}</span>
                      <span className="font-mono text-[8px]">
                        {(item.contribPct * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-2">
            {positiveDrivers.slice(0, 3).map((item, index) => (
              <div key={item.pos.id} className="grid grid-cols-[20px_1fr_auto] items-center gap-2">
                <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
                <div>
                  <div className="font-mono text-[9px] text-foreground">{item.pos.symbol}</div>
                  <div className="mono-caps text-[7px] text-faint">
                    {item.pos.sector ?? item.pos.cls}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] text-primary">
                    {(item.contribPct * 100).toFixed(1)}%
                  </div>
                  <div className="mono-caps text-[6px] text-faint">{money(item.dollar)} VAR</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="p-4">
          <div className="mono-caps flex items-center justify-between text-[8px] text-faint">
            <span>SCENARIO FINGERPRINT</span>
            <span>% OF MAX LOSS</span>
          </div>
          <div className="mt-4 flex h-28 items-end gap-2 border-b border-divider px-1">
            {snapshot.scenarios.map((scenario, index) => {
              const magnitude = Math.abs(scenario.result.total);
              const height = Math.max(8, (magnitude / maxScenario) * 100);
              return (
                <div key={scenario.key} className="flex h-full flex-1 flex-col justify-end">
                  <div className="mb-1 text-center font-mono text-[7px] text-down">
                    {((magnitude / book.nav) * 100).toFixed(1)}%
                  </div>
                  <div
                    className={`w-full ${index === 0 ? "bg-down" : "bg-down/45"}`}
                    style={{ height: `${height}%` }}
                    title={`${scenario.label} · ${signedMoney(scenario.result.total)}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {snapshot.scenarios.map((scenario) => (
              <span
                key={scenario.key}
                className="mono-caps truncate text-center text-[6px] text-faint"
                title={scenario.label}
              >
                {scenario.key.replace(/[0-9]/g, "")}
              </span>
            ))}
          </div>
          <div className="mt-4 border-l-2 border-down bg-down/5 px-3 py-2">
            <div className="mono-caps text-[7px] text-down">BINDING SHOCK</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-[10px] text-foreground">{snapshot.worstScenario?.label}</span>
              <span className="font-mono text-[11px] text-down">
                {signedMoney(snapshot.worstScenario?.result.total ?? 0)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </Panel>
  );
}

function TailMarker({
  left,
  label,
  value,
  tone,
}: {
  left: number;
  label: string;
  value: string;
  tone: "primary" | "down" | "info";
}) {
  const marker = tone === "down" ? "bg-down" : tone === "info" ? "bg-info" : "bg-primary";
  const text = tone === "down" ? "text-down" : tone === "info" ? "text-info" : "text-primary";
  return (
    <div className="absolute top-0 -translate-x-1/2" style={{ left: `${left}%` }}>
      <div className={`mx-auto h-8 w-px ${marker}`} />
      <div className={`mono-caps mt-1 whitespace-nowrap text-center text-[6px] ${text}`}>
        {label}
        <br />
        <span className="font-mono text-[7px]">{value}</span>
      </div>
    </div>
  );
}

function VisualStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-divider px-3 py-2 last:border-r-0">
      <div className="mono-caps text-[6px] text-faint">{label}</div>
      <div className="mt-1 font-mono text-[10px] text-foreground">{value}</div>
    </div>
  );
}
