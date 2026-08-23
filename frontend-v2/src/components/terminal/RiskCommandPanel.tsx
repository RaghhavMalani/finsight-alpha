import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import {
  getBook,
  riskContributions,
  SCENARIOS,
  stress,
  subscribe,
  var1d,
  type Book,
} from "@/lib/book";

type RiskTone = "CLEAR" | "WATCH" | "BREACH";

const LIMITS = {
  var99Nav: 0.025,
  stressNav: 0.12,
  grossLeverage: 1.5,
  sectorGross: 0.35,
};

function compactMoney(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return `$${abs.toFixed(0)}`;
}

function toneFor(utilization: number): RiskTone {
  if (utilization > 1) return "BREACH";
  if (utilization >= 0.8) return "WATCH";
  return "CLEAR";
}

function toneClass(tone: RiskTone) {
  return tone === "BREACH" ? "text-down" : tone === "WATCH" ? "text-primary" : "text-up";
}

export function RiskCommandPanel() {
  const [book, setBook] = useState<Book>(getBook);
  useEffect(() => subscribe(setBook), []);

  const view = useMemo(() => {
    const tail = var1d(book, "HISTORICAL", 0.99);
    const scenarios = Object.entries(SCENARIOS)
      .map(([key, scenario]) => ({
        key,
        label: scenario.label,
        result: stress(book, scenario.shock),
      }))
      .sort((a, b) => a.result.total - b.result.total);
    const contributions = riskContributions(book)
      .filter((item) => item.contribPct > 0)
      .sort((a, b) => b.contribPct - a.contribPct);

    const sectors = new Map<string, number>();
    for (const position of book.positions) {
      const sector = position.sector ?? "Other";
      sectors.set(sector, (sectors.get(sector) ?? 0) + position.gross);
    }
    const topSector = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["—", 0];
    const topSectorPct = book.gross > 0 ? Number(topSector[1]) / book.gross : 0;
    const worstLoss = Math.abs(Math.min(0, scenarios[0]?.result.total ?? 0));
    const grossLeverage = book.nav > 0 ? book.gross / book.nav : 0;
    const limits = [
      {
        label: "99% VaR",
        value: tail.var,
        display: compactMoney(tail.var),
        limit: book.nav * LIMITS.var99Nav,
        utilization: tail.var / (book.nav * LIMITS.var99Nav || 1),
      },
      {
        label: "Worst stress",
        value: worstLoss,
        display: compactMoney(worstLoss),
        limit: book.nav * LIMITS.stressNav,
        utilization: worstLoss / (book.nav * LIMITS.stressNav || 1),
      },
      {
        label: "Gross leverage",
        value: grossLeverage,
        display: `${grossLeverage.toFixed(2)}×`,
        limit: LIMITS.grossLeverage,
        utilization: grossLeverage / LIMITS.grossLeverage,
      },
      {
        label: `${String(topSector[0])} gross`,
        value: topSectorPct,
        display: `${(topSectorPct * 100).toFixed(1)}%`,
        limit: LIMITS.sectorGross,
        utilization: topSectorPct / LIMITS.sectorGross,
      },
    ].map((limit) => ({ ...limit, tone: toneFor(limit.utilization) }));
    const status: RiskTone = limits.some((limit) => limit.tone === "BREACH")
      ? "BREACH"
      : limits.some((limit) => limit.tone === "WATCH")
        ? "WATCH"
        : "CLEAR";

    return {
      tail,
      scenarios,
      contributions,
      topSector,
      topSectorPct,
      worstLoss,
      grossLeverage,
      limits,
      status,
    };
  }, [book]);

  const riskBudget = view.limits[0];
  const utilizationPct = Math.min(100, riskBudget.utilization * 100);
  const gaugeColor =
    view.status === "BREACH" ? "#F06464" : view.status === "WATCH" ? "#F0A929" : "#42C98B";
  const maxScenario = Math.max(
    ...view.scenarios.map((scenario) => Math.abs(scenario.result.total)),
    1,
  );
  const maxDriver = Math.max(...view.contributions.map((item) => item.contribPct), 0.01);
  const primaryIssue =
    view.limits.find((limit) => limit.tone === "BREACH") ??
    view.limits.find((limit) => limit.tone === "WATCH") ??
    view.limits.sort((a, b) => b.utilization - a.utilization)[0];

  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(circle at 16% 8%, rgba(240,169,41,0.12), transparent 28%), radial-gradient(circle at 90% 75%, rgba(69,185,211,0.08), transparent 30%)",
        }}
      />

      <div className="relative grid min-h-full grid-cols-12 gap-2 p-2">
        <section className="col-span-12 border border-border bg-panel/95 lg:col-span-4">
          <div className="flex items-center justify-between border-b border-divider px-3 py-2">
            <div>
              <div className="mono-caps text-[8px] text-faint">MANDATE STATE</div>
              <div className={`mono-caps mt-1 text-[11px] ${toneClass(view.status)}`}>
                {view.status === "BREACH"
                  ? "ACTION REQUIRED"
                  : view.status === "WATCH"
                    ? "HEADROOM TIGHT"
                    : "WITHIN LIMITS"}
              </div>
            </div>
            <span
              className="h-2.5 w-2.5 rounded-full animate-pulse-live"
              style={{ backgroundColor: gaugeColor }}
            />
          </div>

          <div className="grid grid-cols-[132px_1fr] items-center gap-3 p-3">
            <div
              className="relative h-28 w-28 rounded-full p-2"
              style={{
                background: `conic-gradient(${gaugeColor} 0 ${utilizationPct}%, #171B1F ${utilizationPct}% 100%)`,
              }}
            >
              <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-divider bg-background">
                <div className="font-mono text-2xl text-foreground">
                  {Math.round(riskBudget.utilization * 100)}%
                </div>
                <div className="mono-caps mt-1 text-[7px] text-faint">VAR BUDGET</div>
              </div>
            </div>
            <div className="space-y-3">
              <Metric label="1D 99% VaR" value={`−${compactMoney(view.tail.var)}`} tone="down" />
              <Metric
                label="Expected shortfall"
                value={`−${compactMoney(view.tail.es)}`}
                tone="down"
              />
              <Metric
                label="Worst preset"
                value={`−${compactMoney(view.worstLoss)}`}
                tone="primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 border-t border-divider">
            <SmallMetric
              label="GROSS / NAV"
              value={`${view.grossLeverage.toFixed(2)}×`}
              alert={view.grossLeverage >= LIMITS.grossLeverage * 0.8}
            />
            <SmallMetric
              label="TOP SECTOR"
              value={`${String(view.topSector[0])} ${(view.topSectorPct * 100).toFixed(0)}%`}
              alert={view.topSectorPct >= LIMITS.sectorGross * 0.8}
            />
          </div>
        </section>

        <section className="col-span-12 border border-border bg-panel/95 lg:col-span-8">
          <SectionHeader label="SCENARIO LOSS LADDER" note="instantaneous repricing · % of NAV" />
          <div className="space-y-2 p-3">
            {view.scenarios.map((scenario, index) => {
              const loss = Math.abs(Math.min(0, scenario.result.total));
              const width = Math.max(2, (Math.abs(scenario.result.total) / maxScenario) * 100);
              return (
                <div
                  key={scenario.key}
                  className="grid grid-cols-[24px_118px_1fr_88px] items-center gap-2"
                >
                  <span className="font-mono text-[8px] text-faint">0{index + 1}</span>
                  <span className="mono-caps truncate text-[8px] text-foreground">
                    {scenario.label}
                  </span>
                  <div className="relative h-5 overflow-hidden border border-divider bg-background">
                    <div
                      className={`h-full ${scenario.result.total < 0 ? "bg-down/70" : "bg-up/70"}`}
                      style={{ width: `${width}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-px bg-primary"
                      style={{
                        left: `${Math.min(
                          100,
                          ((book.nav * LIMITS.stressNav) / maxScenario) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-right">
                    <div
                      className={`font-mono text-[10px] ${
                        scenario.result.total < 0 ? "text-down" : "text-up"
                      }`}
                    >
                      {scenario.result.total < 0 ? "−" : "+"}
                      {compactMoney(scenario.result.total)}
                    </div>
                    <div className="mono-caps text-[6px] text-faint">
                      {((loss / book.nav) * 100).toFixed(1)}% NAV
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mono-caps flex items-center justify-between border-t border-divider px-3 py-2 text-[7px] text-faint">
            <span>AMBER MARKER · 12% STRESS LIMIT</span>
            <span>{view.scenarios[0]?.label} BINDS</span>
          </div>
        </section>

        <section className="col-span-12 border border-border bg-panel/95 xl:col-span-7">
          <SectionHeader label="RISK CONCENTRATION" note="Euler VaR contribution" />
          <div className="grid grid-cols-1 gap-x-4 p-3 sm:grid-cols-2">
            {view.contributions.slice(0, 6).map((item, index) => (
              <div
                key={item.pos.id}
                className="grid grid-cols-[22px_76px_1fr_48px] items-center gap-2 border-b border-divider/60 py-2"
              >
                <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
                <span className="font-mono text-[9px] text-foreground">{item.pos.symbol}</span>
                <div className="h-1.5 bg-background">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${(item.contribPct / maxDriver) * 100}%` }}
                  />
                </div>
                <span className="text-right font-mono text-[8px] text-primary">
                  {(item.contribPct * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 border border-border bg-panel/95 xl:col-span-5">
          <SectionHeader label="CONTROL TOWER" note="80% watch · 100% breach" />
          <div className="grid grid-cols-2">
            {view.limits.map((limit) => (
              <div
                key={limit.label}
                className="border-b border-r border-divider p-3 last:border-r-0"
              >
                <div className="mono-caps flex items-center justify-between gap-2 text-[7px]">
                  <span className="truncate text-faint">{limit.label}</span>
                  <span className={toneClass(limit.tone)}>{limit.tone}</span>
                </div>
                <div className="mt-2 flex items-end justify-between">
                  <span className="font-mono text-[14px] text-foreground">{limit.display}</span>
                  <span className={`font-mono text-[9px] ${toneClass(limit.tone)}`}>
                    {Math.round(limit.utilization * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1 bg-background">
                  <div
                    className={`h-full ${
                      limit.tone === "BREACH"
                        ? "bg-down"
                        : limit.tone === "WATCH"
                          ? "bg-primary"
                          : "bg-up"
                    }`}
                    style={{ width: `${Math.min(100, limit.utilization * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="col-span-12 flex flex-wrap items-center justify-between gap-3 border border-primary/35 bg-primary/[0.06] px-4 py-3">
          <div>
            <div className="mono-caps text-[8px] text-primary">NEXT RISK ACTION</div>
            <div className="mt-1 text-[11px] text-foreground">
              {primaryIssue.tone === "CLEAR"
                ? `Preserve diversification before adding gross; ${primaryIssue.label} is the nearest limit.`
                : `${primaryIssue.label} is at ${Math.round(primaryIssue.utilization * 100)}% utilization. Review hedge and trim alternatives now.`}
            </div>
          </div>
          <Link
            to="/risk"
            className="mono-caps interactive border border-primary bg-primary px-4 py-2 text-[8px] text-primary-foreground hover:brightness-110"
          >
            OPEN FULL RISK DESK →
          </Link>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ label, note }: { label: string; note: string }) {
  return (
    <div className="mono-caps flex items-center justify-between border-b border-divider px-3 py-2 text-[8px]">
      <span className="text-primary">{label}</span>
      <span className="text-faint">{note}</span>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "down" | "primary";
}) {
  return (
    <div>
      <div className="mono-caps text-[7px] text-faint">{label}</div>
      <div className={`font-mono text-[15px] ${tone === "down" ? "text-down" : "text-primary"}`}>
        {value}
      </div>
    </div>
  );
}

function SmallMetric({ label, value, alert }: { label: string; value: string; alert: boolean }) {
  return (
    <div className="border-r border-divider p-3 last:border-r-0">
      <div className="mono-caps text-[7px] text-faint">{label}</div>
      <div
        className={`mt-1 truncate font-mono text-[11px] ${alert ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
