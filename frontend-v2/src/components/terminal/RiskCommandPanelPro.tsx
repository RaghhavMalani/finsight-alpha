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
  type Position,
} from "@/lib/book";

type Tone = "CLEAR" | "WATCH" | "BREACH";
type Limit = { label: string; short: string; value: string; cap: string; use: number; tone: Tone };

const CAPS = { var: 0.025, stress: 0.12, gross: 1.5, sector: 0.35, name: 0.22 };

function money(value: number) {
  const n = Math.abs(value);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(n >= 100_000 ? 0 : 1)}K`;
  return `$${n.toFixed(0)}`;
}

function signed(value: number) {
  return Math.abs(value) < 1 ? "$0" : `${value < 0 ? "−" : "+"}${money(value)}`;
}

function tone(use: number): Tone {
  return use > 1 ? "BREACH" : use >= 0.8 ? "WATCH" : "CLEAR";
}

function toneText(value: Tone) {
  return value === "BREACH" ? "text-down" : value === "WATCH" ? "text-primary" : "text-up";
}

function polar(i: number, count: number, radius: number) {
  const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
  return { x: 110 + Math.cos(angle) * radius, y: 110 + Math.sin(angle) * radius };
}

export function RiskCommandPanel() {
  const [book, setBook] = useState<Book>(getBook);
  const [activeScenario, setActiveScenario] = useState("CRISIS08");
  useEffect(() => subscribe(setBook), []);

  const view = useMemo(() => {
    const tail95 = var1d(book, "HISTORICAL", 0.95);
    const tail99 = var1d(book, "HISTORICAL", 0.99);
    const scenarios = Object.entries(SCENARIOS)
      .map(([key, preset]) => {
        const result = stress(book, preset.shock);
        return {
          key,
          label: preset.label,
          shock: preset.shock,
          result,
          drivers: [...result.byPos].sort((a, b) => a.pnl - b.pnl),
        };
      })
      .sort((a, b) => a.result.total - b.result.total);
    const contributions = riskContributions(book).sort(
      (a, b) => Math.abs(b.contribPct) - Math.abs(a.contribPct),
    );
    const riskDrivers = contributions
      .filter((row) => row.contribPct > 0)
      .sort((a, b) => b.contribPct - a.contribPct);
    const diversifier = contributions
      .filter((row) => row.contribPct < 0)
      .sort((a, b) => a.contribPct - b.contribPct)[0];
    const sectorMap = new Map<string, { gross: number; net: number; lines: number }>();
    for (const position of book.positions) {
      const key = position.sector ?? "Other";
      const row = sectorMap.get(key) ?? { gross: 0, net: 0, lines: 0 };
      row.gross += position.gross;
      row.net += position.riskNotional ?? position.mv;
      row.lines += 1;
      sectorMap.set(key, row);
    }
    const sectors = [...sectorMap.entries()]
      .map(([name, row]) => ({ name, ...row, grossPct: book.gross ? row.gross / book.gross : 0 }))
      .sort((a, b) => b.gross - a.gross);
    const topSector = sectors[0];
    const topDriver = riskDrivers[0];
    const worstLoss = Math.abs(Math.min(0, scenarios[0]?.result.total ?? 0));
    const gross = book.nav ? book.gross / book.nav : 0;
    const limitData = [
      [
        "1D historical 99% VaR",
        "VAR 99",
        money(tail99.var),
        money(book.nav * CAPS.var),
        tail99.var / (book.nav * CAPS.var || 1),
      ],
      [
        "Worst preset stress",
        "STRESS",
        money(worstLoss),
        money(book.nav * CAPS.stress),
        worstLoss / (book.nav * CAPS.stress || 1),
      ],
      [
        "Gross leverage",
        "GROSS",
        `${gross.toFixed(2)}×`,
        `${CAPS.gross.toFixed(2)}×`,
        gross / CAPS.gross,
      ],
      [
        `${topSector?.name ?? "Top sector"} gross`,
        "SECTOR",
        `${((topSector?.grossPct ?? 0) * 100).toFixed(1)}%`,
        `${CAPS.sector * 100}%`,
        (topSector?.grossPct ?? 0) / CAPS.sector,
      ],
      [
        `${topDriver?.pos.symbol ?? "Top name"} risk share`,
        "SINGLE NAME",
        `${((topDriver?.contribPct ?? 0) * 100).toFixed(1)}%`,
        `${CAPS.name * 100}%`,
        (topDriver?.contribPct ?? 0) / CAPS.name,
      ],
    ] as const;
    const limits: Limit[] = limitData.map(([label, short, value, cap, use]) => ({
      label,
      short,
      value,
      cap,
      use,
      tone: tone(use),
    }));
    const status: Tone = limits.some((row) => row.tone === "BREACH")
      ? "BREACH"
      : limits.some((row) => row.tone === "WATCH")
        ? "WATCH"
        : "CLEAR";
    const binding = [...limits].sort((a, b) => b.use - a.use)[0];
    const effectiveBets = sectors.length
      ? 1 / sectors.reduce((sum, row) => sum + row.grossPct ** 2, 0)
      : 0;
    return {
      tail95,
      tail99,
      scenarios,
      contributions,
      riskDrivers,
      diversifier,
      sectors,
      topDriver,
      worstLoss,
      gross,
      limits,
      status,
      binding,
      effectiveBets,
    };
  }, [book]);

  const selected = view.scenarios.find((row) => row.key === activeScenario) ?? view.scenarios[0];
  const maxScenario = Math.max(...view.scenarios.map((row) => Math.abs(row.result.total)), 1);
  const maxSector = Math.max(...view.sectors.map((row) => Math.abs(row.net)), 1);
  const accent =
    view.status === "BREACH" ? "#F06464" : view.status === "WATCH" ? "#F0A929" : "#42C98B";
  const verdict =
    view.status === "BREACH"
      ? `Stop adding gross. ${view.binding.label} is through mandate.`
      : view.status === "WATCH"
        ? `${view.binding.label} is binding. Pre-position the hedge before adding risk.`
        : `Mandate clear. ${view.binding.label} is the nearest control.`;

  return (
    <div className="relative h-full overflow-y-auto bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 10% 2%,rgba(240,169,41,.13),transparent 25%),radial-gradient(circle at 80% 24%,rgba(69,185,211,.08),transparent 28%),linear-gradient(rgba(255,255,255,.012) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.012) 1px,transparent 1px)",
          backgroundSize: "auto,auto,28px 28px,28px 28px",
        }}
      />

      <header className="sticky top-0 z-30 border-b border-primary/30 bg-background/95 backdrop-blur-xl">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full animate-pulse-live"
              style={{ backgroundColor: accent, boxShadow: `0 0 14px ${accent}` }}
            />
            <div>
              <div className="mono-caps flex items-center gap-2 text-[8px] text-faint">
                <span>RISK COMMAND</span>
                <span>/</span>
                <span className={toneText(view.status)}>
                  {view.status === "CLEAR" ? "MANDATE CLEAR" : `${view.status} · CONTROL ACTIVE`}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-foreground">{verdict}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="mono-caps hidden gap-3 text-[7px] text-faint sm:flex">
              <span>{book.positions.length} LINES</span>
              <span>{view.effectiveBets.toFixed(1)} EFFECTIVE BETS</span>
              <span>LIVE · MODEL SYNC</span>
            </div>
            <Link
              to="/risk"
              className="mono-caps interactive group flex items-center gap-3 border border-primary bg-primary px-3 py-2 text-[8px] text-primary-foreground shadow-[0_0_24px_rgba(240,169,41,.16)] hover:brightness-110"
            >
              OPEN FULL RISK{" "}
              <span className="transition-transform group-hover:translate-x-0.5">↗</span>
            </Link>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-divider/70 sm:grid-cols-3 lg:grid-cols-6">
          <Pulse
            label="PEAK LIMIT USE"
            value={`${Math.round(view.binding.use * 100)}%`}
            tone={view.status}
          />
          <Pulse
            label="1D 99% VAR"
            value={`−${money(view.tail99.var)}`}
            tone={view.limits[0].tone}
          />
          <Pulse
            label="EXPECTED SHORTFALL"
            value={`−${money(view.tail99.es)}`}
            tone={tone(view.tail99.es / (book.nav * 0.035 || 1))}
          />
          <Pulse
            label="NET / NAV"
            value={`${book.net >= 0 ? "+" : "−"}${Math.abs((book.net / book.nav) * 100).toFixed(1)}%`}
          />
          <Pulse
            label="WORST PRESET"
            value={`−${money(view.worstLoss)}`}
            tone={view.limits[1].tone}
          />
          <Pulse
            label="TOP DRIVER"
            value={`${view.topDriver?.pos.symbol ?? "—"} ${((view.topDriver?.contribPct ?? 0) * 100).toFixed(1)}%`}
            tone={view.limits[4].tone}
          />
        </div>
      </header>

      <main className="relative z-10 space-y-2 p-2">
        <div className="grid grid-cols-12 gap-2">
          <section className="col-span-12 overflow-hidden border border-border bg-panel/95 lg:col-span-3">
            <Head label="MANDATE PRESSURE" note="peak control utilization" live />
            <div className="grid grid-cols-[140px_1fr] items-center gap-3 p-3 lg:grid-cols-1 xl:grid-cols-[140px_1fr]">
              <Ring use={view.binding.use} color={accent} />
              <div className="space-y-2">
                <div>
                  <div className="mono-caps text-[6px] text-faint">BINDING CONTROL</div>
                  <div className={`mt-1 text-[12px] ${toneText(view.binding.tone)}`}>
                    {view.binding.short}
                  </div>
                  <div className="font-mono text-[8px] text-muted-foreground">
                    {view.binding.value} / {view.binding.cap}
                  </div>
                </div>
                <div className="h-px bg-divider" />
                <Pair
                  label="VAR HEADROOM"
                  value={money(Math.max(0, book.nav * CAPS.var - view.tail99.var))}
                />
                <Pair label="GROSS / NAV" value={`${view.gross.toFixed(2)}×`} />
                <Pair label="EFFECTIVE BETS" value={view.effectiveBets.toFixed(1)} />
              </div>
            </div>
            <TailRail
              values={[view.tail95.var, view.tail99.var, view.tail99.es, book.nav * CAPS.var]}
            />
          </section>

          <section className="col-span-12 overflow-hidden border border-border bg-panel/95 lg:col-span-5">
            <Head label="RISK GEOMETRY" note="mandate utilization by axis" />
            <div className="grid min-h-[278px] grid-cols-1 items-center md:grid-cols-[1fr_168px]">
              <Radar limits={view.limits} status={view.status} />
              <div className="grid grid-cols-5 border-t border-divider md:grid-cols-1 md:border-l md:border-t-0">
                {view.limits.map((row, index) => (
                  <MiniLimit key={row.short} row={row} index={index} />
                ))}
              </div>
            </div>
          </section>

          <section className="col-span-12 overflow-hidden border border-border bg-panel/95 lg:col-span-4">
            <Head label="CONTROL TOWER" note="80 watch · 100 breach" />
            <div className="divide-y divide-divider">
              {view.limits.map((row, index) => (
                <div
                  key={row.label}
                  className="grid grid-cols-[22px_1fr_60px_50px] items-center gap-2 px-3 py-2.5"
                >
                  <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
                  <div className="min-w-0">
                    <div className="mono-caps truncate text-[7px] text-muted-foreground">
                      {row.label}
                    </div>
                    <Bar use={row.use} tone={row.tone} />
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-[10px] text-foreground">{row.value}</div>
                    <div className="mono-caps text-[6px] text-faint">LMT {row.cap}</div>
                  </div>
                  <span className={`mono-caps text-right text-[7px] ${toneText(row.tone)}`}>
                    {row.tone}
                  </span>
                </div>
              ))}
            </div>
            <div className="m-2 border border-primary/35 bg-primary/[.06] px-3 py-2.5">
              <div className={`mono-caps text-[7px] ${toneText(view.status)}`}>DESK VERDICT</div>
              <p className="mt-1 text-[9px] leading-relaxed text-foreground">{verdict}</p>
            </div>
          </section>
        </div>

        <section className="overflow-hidden border border-border bg-panel/95">
          <Head
            label="SCENARIO WAR ROOM"
            note="select a scenario · inspect loss transmission"
            live
          />
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_.8fr]">
            <div className="xl:border-r xl:border-divider">
              <div className="grid grid-cols-[24px_112px_1fr_80px_52px] gap-2 border-b border-divider px-3 py-2">
                <Col value="#" />
                <Col value="SCENARIO" />
                <Col value="LOSS / 12% LIMIT MARKER" />
                <Col value="BOOK P&L" right />
                <Col value="% NAV" right />
              </div>
              {view.scenarios.map((row, index) => {
                const isActive = selected?.key === row.key;
                const loss = Math.abs(Math.min(0, row.result.total));
                return (
                  <button
                    type="button"
                    key={row.key}
                    onClick={() => setActiveScenario(row.key)}
                    className={`interactive grid w-full grid-cols-[24px_112px_1fr_80px_52px] items-center gap-2 border-b border-divider/70 px-3 py-2.5 text-left ${isActive ? "bg-primary/[.07]" : "hover:bg-foreground/[.025]"}`}
                  >
                    <span
                      className={`font-mono text-[7px] ${isActive ? "text-primary" : "text-faint"}`}
                    >
                      0{index + 1}
                    </span>
                    <span className="mono-caps truncate text-[8px] text-foreground">
                      {row.label}
                    </span>
                    <span className="relative h-5 overflow-hidden border border-divider bg-background">
                      <span
                        className={`block h-full ${row.result.total < 0 ? "bg-down/65" : "bg-up/65"}`}
                        style={{
                          width: `${Math.max(1, (Math.abs(row.result.total) / maxScenario) * 100)}%`,
                        }}
                      />
                      <span
                        className="absolute inset-y-0 w-px bg-primary"
                        style={{
                          left: `${Math.min(100, ((book.nav * CAPS.stress) / maxScenario) * 100)}%`,
                        }}
                      />
                      {isActive ? (
                        <span className="absolute inset-y-0 right-1 flex items-center mono-caps text-[6px] text-primary">
                          ACTIVE
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`text-right font-mono text-[9px] ${row.result.total < 0 ? "text-down" : "text-up"}`}
                    >
                      {signed(row.result.total)}
                    </span>
                    <span className="text-right font-mono text-[8px] text-muted-foreground">
                      {((loss / book.nav) * 100).toFixed(1)}%
                    </span>
                  </button>
                );
              })}
              <div className="mono-caps flex justify-between px-3 py-2 text-[6px] text-faint">
                <span>AMBER MARKER · HARD STRESS LIMIT</span>
                <span>CLICK ROW FOR TRANSMISSION</span>
              </div>
            </div>
            {selected ? <Transmission scenario={selected} nav={book.nav} /> : null}
          </div>
        </section>

        <div className="grid grid-cols-12 gap-2">
          <section className="col-span-12 overflow-hidden border border-border bg-panel/95 lg:col-span-5">
            <Head label="SIGNED EXPOSURE TAPE" note="delta-equivalent · zero centered" />
            <div className="grid grid-cols-[90px_1fr_54px_40px] gap-2 border-b border-divider px-3 py-2">
              <Col value="SECTOR" />
              <Col value="SHORT ← NET → LONG" />
              <Col value="GROSS" right />
              <Col value="LINES" right />
            </div>
            {view.sectors.slice(0, 7).map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[90px_1fr_54px_40px] items-center gap-2 border-b border-divider/70 px-3 py-2"
              >
                <span className="truncate font-mono text-[8px] text-foreground">{row.name}</span>
                <ZeroBar value={row.net} max={maxSector} />
                <span className="text-right font-mono text-[8px] text-muted-foreground">
                  {(row.grossPct * 100).toFixed(0)}%
                </span>
                <span className="text-right font-mono text-[8px] text-faint">
                  {String(row.lines).padStart(2, "0")}
                </span>
              </div>
            ))}
          </section>

          <section className="col-span-12 overflow-hidden border border-border bg-panel/95 lg:col-span-4">
            <Head label="RISK STACK" note="Euler 95% VaR contribution" />
            <div className="grid grid-cols-[22px_62px_1fr_48px_58px] gap-2 border-b border-divider px-3 py-2">
              <Col value="#" />
              <Col value="NAME" />
              <Col value="RISK WEIGHT" />
              <Col value="SHARE" right />
              <Col value="$ VAR" right />
            </div>
            {view.contributions.slice(0, 7).map((row, index) => {
              const max = Math.max(
                ...view.contributions.map((item) => Math.abs(item.contribPct)),
                0.01,
              );
              return (
                <div
                  key={row.pos.id}
                  className="grid grid-cols-[22px_62px_1fr_48px_58px] items-center gap-2 border-b border-divider/70 px-3 py-2"
                >
                  <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
                  <span className="truncate font-mono text-[8px] text-foreground">
                    {row.pos.symbol}
                  </span>
                  <span className="h-1.5 bg-background">
                    <span
                      className={`block h-full ${row.contribPct >= 0 ? "bg-primary" : "bg-up"}`}
                      style={{ width: `${(Math.abs(row.contribPct) / max) * 100}%` }}
                    />
                  </span>
                  <span
                    className={`text-right font-mono text-[8px] ${row.contribPct >= 0 ? "text-primary" : "text-up"}`}
                  >
                    {row.contribPct >= 0 ? "+" : "−"}
                    {Math.abs(row.contribPct * 100).toFixed(1)}%
                  </span>
                  <span className="text-right font-mono text-[8px] text-muted-foreground">
                    {signed(row.dollar)}
                  </span>
                </div>
              );
            })}
            <div className="flex justify-between px-3 py-2">
              <span className="mono-caps text-[6px] text-faint">BEST DIVERSIFIER</span>
              <span className="font-mono text-[8px] text-up">
                {view.diversifier
                  ? `${view.diversifier.pos.symbol} −${Math.abs(view.diversifier.contribPct * 100).toFixed(1)}%`
                  : "NONE"}
              </span>
            </div>
          </section>

          <section className="col-span-12 overflow-hidden border border-primary/35 bg-primary/[.035] lg:col-span-3">
            <Head label="HEDGE QUEUE" note="ordered by urgency" live />
            <Action
              rank="01"
              tone={view.binding.tone}
              label={`CONTROL ${view.binding.short}`}
              detail={`${Math.round(view.binding.use * 100)}% utilized · ${view.binding.value} current`}
            />
            <Action
              rank="02"
              tone="WATCH"
              label={`REDUCE ${view.topDriver?.pos.symbol ?? "TOP DRIVER"} RISK SHARE`}
              detail={`${((view.topDriver?.contribPct ?? 0) * 100).toFixed(1)}% of VaR · review trim or offset`}
            />
            <Action
              rank="03"
              tone="CLEAR"
              label={`DEFEND ${view.scenarios[0]?.label ?? "TAIL"} TAIL`}
              detail={`${money(view.worstLoss)} preset loss · pre-cost the hedge`}
            />
            <div className="p-3">
              <Link
                to="/risk"
                className="mono-caps interactive group flex w-full items-center justify-between border border-primary bg-primary px-3 py-3 text-[8px] text-primary-foreground hover:brightness-110"
              >
                <span>
                  OPEN FULL RISK DESK
                  <span className="mt-1 block text-[6px] opacity-70">
                    HEDGES · LIMITS · CUSTOM STRESS
                  </span>
                </span>
                <span className="text-sm transition-transform group-hover:translate-x-0.5">↗</span>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Head({ label, note, live = false }: { label: string; note: string; live?: boolean }) {
  return (
    <div className="mono-caps flex min-h-9 items-center justify-between border-b border-divider px-3 py-2 text-[7px]">
      <span className="flex items-center gap-2 text-primary">
        {live ? <span className="h-1 w-1 rounded-full bg-primary animate-pulse-live" /> : null}
        {label}
      </span>
      <span className="text-faint">{note}</span>
    </div>
  );
}

function Pulse({ label, value, tone: state }: { label: string; value: string; tone?: Tone }) {
  return (
    <div className="border-r border-divider/70 px-3 py-2 last:border-r-0">
      <div className="mono-caps text-[6px] text-faint">{label}</div>
      <div
        className={`mt-0.5 font-mono text-[10px] ${state ? toneText(state) : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}

function Ring({ use, color }: { use: number; color: string }) {
  return (
    <div
      className="relative mx-auto h-32 w-32 rounded-full p-[7px]"
      style={{
        background: `conic-gradient(${color} 0 ${Math.min(100, use * 100)}%,#171B1F ${Math.min(100, use * 100)}% 100%)`,
        boxShadow: `0 0 30px ${color}18`,
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center rounded-full border border-divider bg-background">
        <div className="font-mono text-[29px] leading-none text-foreground">
          {Math.round(use * 100)}
        </div>
        <div className="mono-caps mt-1 text-[7px] text-faint">% LIMIT USE</div>
        <div className="mono-caps mt-2 text-[6px]" style={{ color }}>
          ● LIVE
        </div>
      </div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="mono-caps text-[6px] text-faint">{label}</span>
      <span className="font-mono text-[9px] text-foreground">{value}</span>
    </div>
  );
}

function Bar({ use, tone: state }: { use: number; tone: Tone }) {
  return (
    <div className="mt-1 h-1 bg-background">
      <div
        className={`h-full ${state === "BREACH" ? "bg-down" : state === "WATCH" ? "bg-primary" : "bg-up"}`}
        style={{ width: `${Math.min(100, use * 100)}%` }}
      />
    </div>
  );
}

function TailRail({ values }: { values: number[] }) {
  const max = Math.max(...values) * 1.12 || 1;
  const labels = ["95", "99", "ES", "LMT"];
  const colors = ["#45B9D3", "#F0A929", "#F06464", "#E7E9EA"];
  return (
    <div className="border-t border-divider px-3 pb-3 pt-2">
      <div className="mono-caps flex justify-between text-[6px] text-faint">
        <span>TAIL LOSS RAIL</span>
        <span>{money(max)} RANGE</span>
      </div>
      <div className="relative mt-5 h-4 border-x border-b border-divider">
        <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-up/60 via-primary/60 to-down/70" />
        {values.map((value, index) => (
          <span
            key={labels[index]}
            className="absolute bottom-0 h-4 w-px"
            style={{
              left: `${Math.min(100, (value / max) * 100)}%`,
              backgroundColor: colors[index],
            }}
          >
            <span
              className={`absolute -translate-x-1/2 font-mono text-[6px] ${index % 2 ? "-top-3" : "-top-5"}`}
              style={{ color: colors[index] }}
            >
              {labels[index]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Radar({ limits, status }: { limits: Limit[]; status: Tone }) {
  const radius = 74;
  const stroke = status === "BREACH" ? "#F06464" : status === "WATCH" ? "#F0A929" : "#42C98B";
  const points = limits
    .map((row, i) => {
      const p = polar(i, limits.length, radius * Math.min(1, row.use));
      return `${p.x},${p.y}`;
    })
    .join(" ");
  return (
    <div className="relative flex h-[278px] items-center justify-center">
      <span className="absolute left-3 top-3 mono-caps text-[6px] text-faint">
        MANDATE ENVELOPE = 100
      </span>
      <svg viewBox="0 0 220 220" className="h-[238px] w-[238px]">
        {[0.25, 0.5, 0.8, 1].map((ring) => (
          <polygon
            key={ring}
            points={limits
              .map((_, i) => {
                const p = polar(i, limits.length, radius * ring);
                return `${p.x},${p.y}`;
              })
              .join(" ")}
            fill="none"
            stroke={ring === 0.8 ? "rgba(240,169,41,.34)" : "rgba(124,134,142,.24)"}
            strokeDasharray={ring === 0.8 ? "3 3" : undefined}
            strokeWidth=".8"
          />
        ))}
        {limits.map((row, i) => {
          const p = polar(i, limits.length, radius);
          const l = polar(i, limits.length, radius + 20);
          return (
            <g key={row.short}>
              <line x1="110" y1="110" x2={p.x} y2={p.y} stroke="rgba(124,134,142,.22)" />
              <text
                x={l.x}
                y={l.y}
                fill="#7C868E"
                fontSize="6"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {row.short}
              </text>
              <text
                x={l.x}
                y={l.y + 9}
                fill={row.use >= 1 ? "#F06464" : row.use >= 0.8 ? "#F0A929" : "#E7E9EA"}
                fontSize="6"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {Math.round(row.use * 100)}
              </text>
            </g>
          );
        })}
        <polygon points={points} fill={`${stroke}22`} stroke={stroke} strokeWidth="1.5" />
        {limits.map((row, i) => {
          const p = polar(i, limits.length, radius * Math.min(1, row.use));
          return (
            <circle key={row.short} cx={p.x} cy={p.y} r="2.4" fill={stroke} stroke="#0E1113" />
          );
        })}
      </svg>
      <div className="absolute bottom-2 left-3 right-3 flex justify-between mono-caps text-[6px] text-faint">
        <span>80 · WATCH</span>
        <span>100 · HARD LIMIT</span>
      </div>
    </div>
  );
}

function MiniLimit({ row, index }: { row: Limit; index: number }) {
  return (
    <div className="border-r border-divider px-2 py-2 last:border-r-0 md:border-b md:border-r-0">
      <div className="mono-caps flex justify-between gap-1 text-[6px]">
        <span className="truncate text-faint">
          0{index + 1} {row.short}
        </span>
        <span className={toneText(row.tone)}>{Math.round(row.use * 100)}</span>
      </div>
      <Bar use={row.use} tone={row.tone} />
    </div>
  );
}

function Col({ value, right = false }: { value: string; right?: boolean }) {
  return (
    <span className={`mono-caps text-[6px] text-faint ${right ? "text-right" : ""}`}>{value}</span>
  );
}

function Transmission({
  scenario,
  nav,
}: {
  scenario: {
    label: string;
    shock: { equityPct?: number; ratesBp?: number; oilPct?: number; volMult?: number };
    result: { total: number };
    drivers: { pos: Position; pnl: number }[];
  };
  nav: number;
}) {
  const max = Math.max(...scenario.drivers.map((row) => Math.abs(row.pnl)), 1);
  const chips = [
    scenario.shock.equityPct != null ? `EQ ${(scenario.shock.equityPct * 100).toFixed(0)}%` : null,
    scenario.shock.ratesBp != null
      ? `RATES ${scenario.shock.ratesBp >= 0 ? "+" : ""}${scenario.shock.ratesBp}BP`
      : null,
    scenario.shock.oilPct != null
      ? `OIL ${scenario.shock.oilPct >= 0 ? "+" : ""}${(scenario.shock.oilPct * 100).toFixed(0)}%`
      : null,
    scenario.shock.volMult != null ? `VOL ${scenario.shock.volMult.toFixed(1)}×` : null,
  ].filter((chip): chip is string => chip !== null);
  return (
    <div className="bg-background/45">
      <div className="border-b border-divider p-3">
        <div className="flex justify-between">
          <div>
            <div className="mono-caps text-[7px] text-primary">ACTIVE TRANSMISSION</div>
            <div className="mt-1 font-mono text-[13px] text-foreground">{scenario.label}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[15px] text-down">{signed(scenario.result.total)}</div>
            <div className="mono-caps text-[6px] text-faint">
              {((Math.abs(Math.min(0, scenario.result.total)) / nav) * 100).toFixed(1)}% NAV
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {chips.map((chip) => (
            <span
              key={chip}
              className="mono-caps border border-divider bg-panel px-2 py-1 text-[6px] text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>
      <div className="p-3">
        <div className="mono-caps mb-1 text-[6px] text-faint">LOSS TRANSMISSION · TOP 4</div>
        {scenario.drivers.slice(0, 4).map((row, index) => (
          <div
            key={row.pos.id}
            className="grid grid-cols-[20px_68px_1fr_62px] items-center gap-2 border-b border-divider/60 py-2"
          >
            <span className="font-mono text-[7px] text-faint">0{index + 1}</span>
            <span className="truncate font-mono text-[8px] text-foreground">{row.pos.symbol}</span>
            <span className="h-1.5 bg-panel">
              <span
                className={`block h-full ${row.pnl < 0 ? "bg-down" : "bg-up"}`}
                style={{ width: `${(Math.abs(row.pnl) / max) * 100}%` }}
              />
            </span>
            <span
              className={`text-right font-mono text-[8px] ${row.pnl < 0 ? "text-down" : "text-up"}`}
            >
              {signed(row.pnl)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZeroBar({ value, max }: { value: number; max: number }) {
  const width = Math.min(50, (Math.abs(value) / max) * 50);
  return (
    <div className="relative h-4 overflow-hidden border border-divider bg-background">
      <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/50" />
      <span
        className={`absolute inset-y-[3px] ${value >= 0 ? "left-1/2 bg-up/75" : "right-1/2 bg-down/75"}`}
        style={{ width: `${width}%` }}
      />
      <span
        className={`absolute inset-y-0 flex items-center font-mono text-[6px] ${value >= 0 ? "right-1 text-up" : "left-1 text-down"}`}
      >
        {signed(value)}
      </span>
    </div>
  );
}

function Action({
  rank,
  tone: state,
  label,
  detail,
}: {
  rank: string;
  tone: Tone;
  label: string;
  detail: string;
}) {
  return (
    <div className="grid grid-cols-[28px_1fr] gap-2 border-b border-divider/70 px-3 py-3">
      <span
        className={`flex h-6 w-6 items-center justify-center border font-mono text-[7px] ${state === "BREACH" ? "border-down/45 bg-down/[.08]" : state === "WATCH" ? "border-primary/45 bg-primary/[.08]" : "border-up/35 bg-up/[.06]"} ${toneText(state)}`}
      >
        {rank}
      </span>
      <div className="min-w-0">
        <div className={`mono-caps truncate text-[7px] ${toneText(state)}`}>{label}</div>
        <div className="mt-1 text-[8px] leading-relaxed text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}
