import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  adaptBacktest,
  adaptBars,
  adaptQuotes,
  adaptSearch,
  DEFAULT_WATCHLIST,
  overviewTarget,
  parseWatchlist,
  adaptFactors,
  adaptFundamentals,
  adaptMarketChain,
  adaptMonteCarlo,
  adaptOptionPrice,
  adaptPortfolio,
  adaptResearchAnswer,
  adaptResearchIndex,
  adaptRiskDashboard,
  adaptStrategy,
  adaptTheoreticalChain,
  adaptVolSurface,
  atmQuote,
  drawdownOf,
  fiscalYears,
  MarketsContractError,
  mid,
  normalizeTicker,
  parityGap,
  twoSidedCount,
} from "../src/markets/contracts.ts";
import {
  bandPath,
  bandScale,
  candleGeometry,
  extent,
  labelIndices,
  labelRows,
  linePath,
  linearScale,
  niceTicks,
  pad,
  quantile,
  unit,
} from "../src/markets/chart-math.ts";
import { barTime, compactNum, num, pct, stamp } from "../src/markets/format.ts";

// Usage: node scripts/verify-markets.mjs [--url http://127.0.0.1:4174]
// Without --url the contract and math checks run against the simulated fixtures that
// scripts/export_markets_fixtures.py produces from the real routes. With it, Chromium also
// renders every Markets screen at 1440 and 390 px, with the API answered from those fixtures,
// then failing, then signed out.
const urlFlag = process.argv.indexOf("--url");
const baseUrl = urlFlag > 0 ? process.argv[urlFlag + 1]?.replace(/\/$/, "") : null;

const dir = new URL("./fixtures/markets/", import.meta.url);
const fixtures = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith(".simulated.json"))
    .map((f) => [f.replace(".simulated.json", ""), JSON.parse(readFileSync(new URL(f, dir)))]),
);
let count = 0;
const check = (fn) => {
  fn();
  count++;
};
const rejects = (adapt, value, why) =>
  check(() => assert.throws(() => adapt(value), MarketsContractError, why));
const mutated = (name, mutate) => {
  const copy = structuredClone(fixtures[name]);
  mutate(copy);
  return copy;
};

// ------------------------------------------------ every adapter accepts what its route returns
const ADAPTERS = {
  "quote-bars-1d": (v) => adaptBars(v, { ticker: "SIMF", range: "1D" }),
  "quote-bars-5d": (v) => adaptBars(v, { ticker: "SIMF", range: "5D" }),
  "quote-bars-1y": (v) => adaptBars(v, { ticker: "SIMF", range: "1Y" }),
  "quote-bars-5y": (v) => adaptBars(v, { ticker: "SIMF", range: "5Y" }),
  tape: (v) => adaptQuotes(v, ["SIMF", ...DEFAULT_WATCHLIST]),
  "tape-live": (v) => adaptQuotes(v, ["SIMF", ...DEFAULT_WATCHLIST]),
  "assets-search": adaptSearch,
  "options-price-call": adaptOptionPrice,
  "options-price-put": adaptOptionPrice,
  "options-strategy": adaptStrategy,
  "options-chain": adaptTheoreticalChain,
  "options-market-chain": adaptMarketChain,
  "risk-dashboard": adaptRiskDashboard,
  "risk-montecarlo": adaptMonteCarlo,
  factors: adaptFactors,
  portfolio: adaptPortfolio,
  backtest: adaptBacktest,
  fundamentals: adaptFundamentals,
  "fundamentals-before-restatement": adaptFundamentals,
  "research-fetch": adaptResearchIndex,
  "research-ask": adaptResearchAnswer,
};
for (const [name, adapt] of Object.entries(ADAPTERS)) {
  assert.ok(fixtures[name], `missing fixture ${name}`);
  check(() => adapt(fixtures[name]));
}
assert.deepEqual(
  Object.keys(fixtures).sort(),
  [...Object.keys(ADAPTERS), "vol-surface"].sort(),
  "every fixture has an adapter check",
);

// ------------------------------------------------ and refuses anything else
const intradayAdapter = ADAPTERS["quote-bars-1d"];
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.bars[0].c = "12")),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => x.bars.reverse()),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.ticker = "QQQ")),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.range = "5D")),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.bars[0].t = x.bars[0].t.slice(0, 19))),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.bars[0].h = x.bars[0].l - 1)),
);
rejects(
  intradayAdapter,
  mutated("quote-bars-1d", (x) => (x.bars[0].v = -1)),
);
rejects(
  ADAPTERS.tape,
  mutated("tape", (x) => delete x.items[0].last),
);
rejects(
  adaptSearch,
  mutated("assets-search", (x) => delete x.items[0].symbol),
);
check(() => {
  const quotes = ADAPTERS["tape-live"](fixtures["tape-live"]);
  assert.equal(quotes.SIMF.quote_ts, "2026-01-02T20:59:58.000Z");
  assert.equal(quotes.SIMF.source, "FINNHUB");
  assert.equal(quotes["RELIANCE.NS"].source, "YFINANCE_EOD");
  assert.equal(quotes["RELIANCE.NS"].live, false);
  for (const symbol of DEFAULT_WATCHLIST) assert.ok(ADAPTERS.tape(fixtures.tape)[symbol]);
  assert.equal(adaptQuotes(fixtures.tape, ["MISSING"]).MISSING, null);
});
check(() => {
  const days = fixtures["quote-bars-1y"].bars;
  const weekStart = (t) => {
    const d = new Date(`${t}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  let weeks = 0;
  for (const weekly of fixtures["quote-bars-5y"].bars) {
    if (weekly.t < days[0].t) continue;
    const group = days.filter((b) => weekStart(b.t) === weekStart(weekly.t));
    if (!group.length || group[0].t !== weekly.t) continue;
    const expected = {
      o: group[0].o,
      h: Math.max(...group.map((b) => b.h)),
      l: Math.min(...group.map((b) => b.l)),
      c: group.at(-1).c,
      v: group.reduce((sum, b) => sum + b.v, 0),
    };
    for (const field of ["o", "h", "l", "c", "v"])
      assert.ok(
        Math.abs(weekly[field] - expected[field]) <= Math.max(1, Math.abs(expected[field])) * 1e-8,
        `${weekly.t} ${field}: weekly aggregation`,
      );
    weeks++;
  }
  assert.ok(weeks >= 50, "at least a year of overlapping weekly aggregates");
});
check(() =>
  assert.deepEqual(parseWatchlist(["spy", "SPY", " reliance.ns ", "bad;", 5]), [
    "SPY",
    "RELIANCE.NS",
  ]),
);
check(() => assert.equal(parseWatchlist(Array.from({ length: 35 }, (_, i) => `T${i}`)).length, 30));
check(() => assert.deepEqual(parseWatchlist([]), []));
check(() =>
  assert.deepEqual(overviewTarget("RISK"), { to: "/markets", search: { ticker: "RISK" } }),
);
check(() => assert.equal(overviewTarget("BAJAJ-AUTO.NS").params.ticker, "BAJAJ-AUTO.NS"));
check(() => assert.equal(normalizeTicker("BAJAJ-AUTO.NS"), "BAJAJ-AUTO.NS"));
check(() => assert.equal(normalizeTicker("-BAD"), null));
check(() => {
  const scale = bandScale(4, 20, 100);
  assert.equal(scale.center(0), 30);
  assert.equal(scale.center(3), 90);
  assert.equal(scale.nearest(-20), 0);
  assert.equal(scale.nearest(200), 3);
  const shape = candleGeometry({ o: 10, h: 12, l: 8, c: 11 }, (v) => 100 - v * 2);
  assert.deepEqual(shape, { top: 78, height: 2, wickTop: 76, wickBottom: 84, up: true });
  assert.equal(candleGeometry({ o: 10, h: 10, l: 10, c: 10 }, (v) => v).height, 1);
});
check(() => assert.equal(compactNum(null), "—"));
check(() => assert.equal(compactNum(1200000), "1.2M"));
check(() => assert.equal(barTime("2026-01-02T09:30:00-05:00", "America/New_York"), "09:30 ET"));
check(() => assert.equal(barTime("2026-01-02T09:15:00+05:30", "Asia/Kolkata"), "09:15 IST"));
check(() => assert.equal(barTime("2026-01-02", null), "2026-01-02"));
rejects(
  adaptOptionPrice,
  mutated("options-price-call", (x) => delete x.price),
  "missing price",
);
rejects(
  adaptOptionPrice,
  mutated("options-price-call", (x) => (x.option_type = "straddle")),
);
rejects(
  adaptOptionPrice,
  mutated("options-price-call", (x) => x.sensitivity.delta.pop()),
);
rejects(
  adaptStrategy,
  mutated("options-strategy", (x) => (x.payoff[3] = "12")),
  "string number",
);
rejects(
  adaptMarketChain,
  mutated("options-market-chain", (x) => (x.rows = [])),
  "empty chain",
);
rejects(
  adaptMarketChain,
  mutated("options-market-chain", (x) => delete x.rows[0].call.in_the_money),
);
rejects(
  adaptMarketChain,
  mutated("options-market-chain", (x) => delete x.as_of),
  "no as_of",
);
rejects(
  adaptTheoreticalChain,
  mutated("options-chain", (x) => (x.expiries[0].rows[0].strike = null)),
);
rejects(
  adaptRiskDashboard,
  mutated("risk-dashboard", (x) => x.price.values.pop()),
  "ragged",
);
rejects(
  adaptRiskDashboard,
  mutated("risk-dashboard", (x) => delete x.headline.ann_vol),
);
rejects(
  adaptRiskDashboard,
  mutated("risk-dashboard", (x) => delete x.var_table[0].monte_carlo),
);
rejects(
  adaptMonteCarlo,
  mutated("risk-montecarlo", (x) => x.fan.p95.pop()),
  "ragged fan",
);
rejects(
  adaptMonteCarlo,
  mutated("risk-montecarlo", (x) => delete x.quality),
);
rejects(
  adaptPortfolio,
  mutated("portfolio", (x) => x.correlation.matrix.pop()),
  "ragged corr",
);
rejects(
  adaptBacktest,
  mutated("backtest", (x) => (x.strategy = "magic")),
  "unknown strategy",
);
rejects(
  adaptBacktest,
  mutated("backtest", (x) => x.equity.pop()),
  "ragged equity",
);
rejects(
  adaptFundamentals,
  mutated("fundamentals", (x) => (x.history.revenue[0].val = null)),
);
rejects(
  adaptResearchAnswer,
  mutated("research-ask", (x) => (x.grounded = "yes")),
);

// The vol-surface fixture is the route's synthetic fallback, produced only when asked for.
// The UI never asks, and the adapter refuses it as a second line of defence.
check(() => assert.equal(fixtures["vol-surface"].source, "synthetic"));
rejects(adaptVolSurface, fixtures["vol-surface"], "synthetic surface");
const liveSurface = mutated("vol-surface", (x) => (x.source = "yfinance"));
check(() => assert.equal(adaptVolSurface(liveSurface).iv.length, liveSurface.maturities.length));
rejects(
  adaptVolSurface,
  mutated("vol-surface", (x) => x.iv[0].pop()),
  "ragged grid",
);

// ------------------------------------------------ the numbers mean what the screens say
const call = adaptOptionPrice(fixtures["options-price-call"]),
  put = adaptOptionPrice(fixtures["options-price-put"]);
check(() => assert.ok(Math.abs(parityGap(call, put)) < 1e-6, "put-call parity holds"));
check(() => assert.ok(call.greeks.delta > 0 && put.greeks.delta < 0));
check(() =>
  assert.ok(Math.abs(call.models.binomial - call.price) < 0.01, "CRR converges to BS (European)"),
);
check(() =>
  assert.ok(put.models.binomial_american >= put.models.binomial - 1e-9, "American ≥ European"),
);

const spread = adaptStrategy(fixtures["options-strategy"]);
check(() => {
  // Long 100 call, short 110 call: loss capped at the debit, gain at width minus debit.
  assert.ok(Math.abs(spread.max_loss + spread.net_premium) < 1e-6);
  assert.ok(Math.abs(spread.max_profit - (10 - spread.net_premium)) < 1e-6);
  assert.equal(spread.breakevens.length, 1);
  assert.ok(Math.abs(spread.breakevens[0] - (100 + spread.net_premium)) < 0.05);
});

const chain = adaptMarketChain(fixtures["options-market-chain"]);
check(() => assert.deepEqual(atmQuote(chain).strike, 500));
check(() => assert.ok(atmQuote(chain).iv > 0));
check(() => assert.equal(twoSidedCount(chain), chain.rows.length));
// Off-hours Yahoo: no bid, no ask, IV placeholder 1e-05 (the route nulls it; the adapter must
// not treat a stray one as a 0% vol either).
const offHours = adaptMarketChain(
  mutated("options-market-chain", (x) => {
    for (const row of x.rows)
      for (const leg of [row.call, row.put]) Object.assign(leg, { bid: 0, ask: 0, iv: 1e-5 });
  }),
);
check(() => assert.equal(twoSidedCount(offHours), 0));
check(() => assert.equal(atmQuote(offHours).iv, null, "a placeholder IV is not a quoted vol"));
check(() => assert.equal(mid({ bid: 1, ask: 1.2 }), 1.1));
check(() => assert.equal(mid({ bid: 0, ask: 1.2 }), null, "one-sided quote has no mid"));
check(() => assert.equal(mid({ bid: 1.3, ask: 1.2 }), null, "crossed quote has no mid"));
check(() => assert.equal(mid({ bid: null, ask: 1.2 }), null));

const now = adaptFundamentals(fixtures.fundamentals),
  then = adaptFundamentals(fixtures["fundamentals-before-restatement"]);
check(() => {
  const fy23 = (f) => f.history.revenue.find((p) => p.year === 2023);
  assert.equal(fy23(then).val, 1100, "original FY2023 revenue before the restatement");
  assert.equal(fy23(now).val, 1080, "restated once the FY2024 10-K is filed");
  assert.notEqual(fy23(then).accn, fy23(now).accn, "each value names its own filing");
  assert.deepEqual(fiscalYears(now), [2024, 2023, 2022]);
  assert.deepEqual(fiscalYears(then), [2023, 2022]);
  assert.ok(then.latest_filed < now.latest_filed);
});

const mc = adaptMonteCarlo(fixtures["risk-montecarlo"]);
check(() => {
  for (let i = 0; i < mc.fan.days.length; i++)
    assert.ok(mc.fan.p5[i] <= mc.fan.p50[i] && mc.fan.p50[i] <= mc.fan.p95[i], "fan is ordered");
  assert.equal(mc.quality.status, "DEGRADED", "quality is passed through, not upgraded");
});

check(() => assert.deepEqual(drawdownOf([1, 2, 1, null, 3]), [0, 0, -0.5, null, 0]));
check(() => assert.equal(normalizeTicker(" brk.b "), "BRK.B"));
check(() => assert.equal(normalizeTicker("^GSPC"), "^GSPC"));
check(() => assert.equal(normalizeTicker("spy;drop"), null));
check(() => assert.equal(normalizeTicker(""), null));

// ------------------------------------------------ chart math
check(() => assert.deepEqual(niceTicks(0, 1, 5), [0, 0.2, 0.4, 0.6, 0.8, 1]));
check(() => assert.deepEqual(niceTicks(-0.034, 0.051, 4), [-0.02, 0, 0.02, 0.04]));
check(() => assert.deepEqual(niceTicks(95, 105, 4), [96, 98, 100, 102, 104]));
check(() => assert.deepEqual(niceTicks(3, 3), [3]));
check(() => assert.deepEqual(niceTicks(NaN, 1), []));
check(() => {
  const s = linearScale([0, 10], [100, 200]);
  assert.equal(s(5), 150);
  assert.deepEqual(s.domain, [0, 10]);
  assert.equal(linearScale([2, 2], [0, 10])(2), 0, "a flat domain does not divide by zero");
});
check(() => assert.deepEqual(extent([3, null, -1], [NaN, 7]), [-1, 7]));
check(() => assert.equal(extent([null], []), null));
check(() => assert.deepEqual(pad([0, 10], 0.1), [-1, 11]));
check(() => {
  const id = (v) => v;
  assert.equal(linePath([0, 1, 2, 3], [1, null, 2, 3], id, id), "M0.0,1.0M2.0,2.0L3.0,3.0");
  assert.equal(bandPath([0, 1], [0, 0], [1, 2], id, id), "M0.0,1.0L1.0,2.0L1.0,0.0L0.0,0.0Z");
  assert.equal(bandPath([0], [0], [1], id, id), "");
});
check(() => assert.deepEqual(labelIndices(10, 4), [0, 3, 6, 9]));
check(() => assert.deepEqual(labelIndices(3, 5), [0, 1, 2]));
check(() => assert.equal(unit(5, 0, 10), 0.5) || assert.equal(unit(20, 0, 10), 1));

check(() => assert.equal(stamp("2026-10-05T00:00:00"), "2026-10-05", "naive midnight is a date"));
check(() => assert.equal(stamp("2026-10-05 16:00:00"), "2026-10-05 16:00", "naive time stays"));
check(() => assert.equal(stamp("2026-10-06T15:51:02.1+00:00"), "2026-10-06 15:51 UTC"));
check(() => assert.equal(stamp("2026-10-06T21:21:02+05:30"), "2026-10-06 15:51 UTC"));
check(() => assert.equal(stamp("2026-10-05"), "2026-10-05"));
check(() => assert.equal(stamp(null), "—"));
check(() => assert.equal(pct(null), "—", "missing is a dash, never 0%"));
check(() => assert.equal(pct(0.01234, 1, true), "+1.2%"));
check(() => assert.equal(num(-0.0004), "0.00", "no negative zero"));
check(() => assert.equal(pct(-0.00001, 1, true), "0.0%"));
check(() => assert.equal(num(-1.239, 2), "-1.24"));
check(() => assert.deepEqual(labelRows([100, 102, 300, 104], 56), [0, 1, 0, 2]));
check(() => assert.deepEqual(labelRows([300, 100, 200], 56), [0, 0, 0]));
check(() => assert.equal(quantile([4, 1, null, 3, 2], 0.5), 2.5));
check(() => assert.equal(quantile([1, 2, 3, 4, 5], 0.25), 2));
check(() => assert.equal(quantile([7], 0.98), 7));
check(() => assert.equal(quantile([null, NaN], 0.5), null));

console.log(`${count} Markets contract, sabotage and chart-math checks passed`);

// ------------------------------------------------ browser: layout, states and type size
if (baseUrl) {
  const { chromium } = await import("playwright");
  const API = [
    [
      /\/quote\/bars\//,
      (u) => ({
        ...fixtures[`quote-bars-${(u.searchParams.get("range") || "1D").toLowerCase()}`],
        ticker: decodeURIComponent(u.pathname.split("/").at(-1)),
      }),
    ],
    [
      /\/tape/,
      (u) => ({
        ...fixtures["tape-live"],
        items: (u.searchParams.get("symbols") || "SIMF").split(",").map((ticker) => ({
          ...(fixtures["tape-live"].items.find((q) => q.ticker === ticker) ??
            fixtures["tape-live"].items[0]),
          ticker,
        })),
      }),
    ],
    [/\/assets\/search/, "assets-search"],
    [/\/options\/market-chain\//, "options-market-chain"],
    [
      /\/options\/price/,
      (u) => (u.searchParams.get("type") === "put" ? "options-price-put" : "options-price-call"),
    ],
    [/\/options\/strategy/, "options-strategy"],
    [/\/options\/chain\//, "options-chain"],
    [/\/vol\/surface\//, () => liveSurface],
    [/\/risk\/dashboard\//, "risk-dashboard"],
    [/\/risk\/montecarlo\//, "risk-montecarlo"],
    [/\/factors\//, "factors"],
    [/\/portfolio\/risk/, "portfolio"],
    [/\/backtest\//, "backtest"],
    [/\/fundamentals\//, "fundamentals"],
    [/\/research\/fetch\//, "research-fetch"],
    [/\/research\/ask/, "research-ask"],
  ];
  const appOrigin = new URL(baseUrl).origin;
  const isApi = (url) =>
    url.origin !== appOrigin || url.pathname.startsWith("/api/")
      ? API.find(([re]) => re.test(url.pathname))
      : null;

  // Screen → what to do after load, and what must be on the page with data.
  const SCREENS = {
    overview: {
      path: "/markets/SIMF",
      act: async (page) => {
        await page.getByRole("radio", { name: "1Y", exact: true }).click();
        await page.waitForURL(/range=1Y/);
        await page.getByRole("radio", { name: "5Y", exact: true }).click();
        await page.waitForURL(/range=5Y/);
        await page.getByRole("combobox").fill("sim");
        await page.getByRole("option", { name: /SIMF.NS/ }).waitFor();
        await page.getByRole("combobox").press("ArrowDown");
        await page.getByRole("combobox").press("ArrowDown");
        await page.getByRole("combobox").press("Enter");
        await page.waitForURL(/\/markets\/SIMF.NS/);
        await page.getByRole("button", { name: "Add to watchlist", exact: true }).click();
        await page
          .locator(".mk-watch tbody")
          .getByRole("link", { name: "SIMF.NS", exact: true })
          .waitFor();
        await page.reload();
        await page.getByRole("button", { name: "Remove from watchlist", exact: true }).waitFor();
        await page
          .getByRole("button", { name: "Remove SIMF.NS from watchlist", exact: true })
          .click();
        await page.getByRole("button", { name: "Add to watchlist", exact: true }).waitFor();
      },
      expect: [".mk-quote .mk-kpis", ".mk-candles svg", ".mk-watch tbody tr"],
    },
    "overview-index": {
      path: "/markets?ticker=SIMF",
      expect: [".mk-quote .mk-kpis", ".mk-candles svg", ".mk-watch tbody tr"],
    },
    options: {
      act: async (page) => {
        await page.getByRole("button", { name: "Load surface" }).click();
        await page.getByRole("button", { name: "Show theoretical chain" }).click();
        await page.getByRole("button", { name: "Bull call spread" }).click();
      },
      expect: [".mk-chain tbody tr", "figure.mk-chart svg", ".mk-kpis"],
    },
    risk: {
      act: async (page) => {
        await page.getByRole("button", { name: "Analyze" }).click();
      },
      expect: [".mk-kpis", "figure.mk-chart svg", ".mk-bars", ".mk-corr"],
    },
    backtest: { expect: ["figure.mk-chart svg", ".mk-table tbody tr"] },
    fundamentals: { expect: [".mk-table tbody tr", ".mk-kpis", ".mk-banner"] },
    research: {
      act: async (page) => {
        await page.getByRole("button", { name: "Index latest filing" }).click();
        await page.getByLabel(/Question about/).fill("What drove revenue growth?");
        await page.getByRole("button", { name: "Ask", exact: true }).click();
      },
      expect: [".mk-citations li", ".mk-answer-text"],
    },
  };

  // Wait for no loading line; on timeout, say where and what was still loading.
  const settle = (page, where) =>
    page
      .waitForFunction(() => !document.querySelector(".mk-loading"), null, { timeout: 45000 })
      .catch(async () => {
        const stuck = await page.$$eval(".mk-loading", (els) => els.map((e) => e.textContent));
        assert.fail(`${where}: still loading after 45 s: ${JSON.stringify(stuck)}`);
      });
  // The screens are lazy routes streamed from the server: their markup can be on the page
  // before React owns it, and a click on it then is lost. Wait for the panel's React fiber.
  const hydrated = (page, where) =>
    page
      .waitForFunction(
        () => {
          const el = document.querySelector(".mk-panel");
          return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
        },
        null,
        { timeout: 45000 },
      )
      .catch(() => assert.fail(`${where}: the screen never hydrated`));
  const layout = (page) =>
    page.evaluate(() => {
      const tooSmall = [];
      const root = document.querySelector(".mk");
      for (const el of root ? root.querySelectorAll("*") : []) {
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own || el.closest(".sr-only")) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 11)
          tooSmall.push(
            `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" ${size}px`,
          );
      }
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        tooSmall,
        unavailable: [...document.querySelectorAll(".mk-unavailable")].map((e) => e.textContent),
        panels: document.querySelectorAll(".mk-panel").length,
      };
    });

  const browser = await chromium.launch();
  let views = 0;
  try {
    for (const width of [1440, 390]) {
      // 1. The API answers with the route fixtures: every panel renders data.
      for (const [screen, spec] of Object.entries(SCREENS)) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        // A resource failure logs a URL-less console line; third-party hosts (web fonts) can
        // flake, so judge resource loads by URL and fail only on the app's own origin.
        page.on(
          "console",
          (m) =>
            m.type() === "error" &&
            !m.text().startsWith("Failed to load resource") &&
            errors.push(m.text()),
        );
        page.on(
          "requestfailed",
          (r) =>
            new URL(r.url()).origin === appOrigin &&
            errors.push(`${r.failure()?.errorText} ${r.url()}`),
        );
        page.on(
          "response",
          (r) =>
            new URL(r.url()).origin === appOrigin &&
            r.status() >= 400 &&
            errors.push(`${r.status()} ${r.url()}`),
        );
        await page.route(
          (url) => Boolean(isApi(url)),
          (route) => {
            const url = new URL(route.request().url());
            const [, source] = isApi(url);
            const body = typeof source === "function" ? source(url) : source;
            const payload = typeof body === "string" ? fixtures[body] : body;
            return route.fulfill({ json: payload });
          },
        );
        const where = `${screen} @${width}`;
        await page.goto(`${baseUrl}${spec.path ?? `/markets/${screen}?ticker=SIMF`}`, {
          waitUntil: "load",
        });
        await hydrated(page, where);
        await settle(page, where);
        if (spec.act) await spec.act(page);
        await settle(page, where);
        // Actions start requests; wait for what they render rather than racing the spinner.
        for (const selector of spec.expect)
          await page
            .locator(selector)
            .first()
            .waitFor({ state: "visible", timeout: 30000 })
            .catch(() => assert.fail(`${screen} @${width}: ${selector} not rendered`));
        await settle(page, where);
        const l = await layout(page);
        assert.deepEqual(l.unavailable, [], `${screen} @${width}: unexpected unavailable state`);
        assert.ok(l.overflow <= 0, `${screen} @${width}: page overflows by ${l.overflow}px`);
        assert.deepEqual(l.tooSmall, [], `${screen} @${width}: text below 11px`);
        assert.deepEqual(errors, [], `${screen} @${width}: console or app-origin request errors`);
        await page.close();
        views++;
      }

      // 2. The API fails, then rejects the session: each screen says so in a line, never blank.
      for (const [status, expectText] of [
        [503, /unavailable\. Provider down for this check/],
        [401, /Sign in to load/],
      ]) {
        for (const screen of Object.keys(SCREENS)) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          const errors = [];
          page.on("pageerror", (e) => errors.push(e.message));
          await page.route(
            (url) => Boolean(isApi(url)),
            (route) => route.fulfill({ status, json: { detail: "Provider down for this check." } }),
          );
          const where = `${screen} @${width} ${status}`;
          await page.goto(`${baseUrl}${SCREENS[screen].path ?? `/markets/${screen}?ticker=SIMF`}`, {
            waitUntil: "load",
          });
          await hydrated(page, where);
          if (screen === "research") {
            await page.getByRole("button", { name: "Index latest filing" }).click();
            await page.locator(".mk-unavailable").first().waitFor({ timeout: 30000 });
          }
          await settle(page, where);
          const l = await layout(page);
          assert.ok(l.panels > 0, `${screen} @${width} ${status}: blank page`);
          assert.ok(
            l.unavailable.length > 0 && l.unavailable.every((t) => expectText.test(t)),
            `${screen} @${width} ${status}: ${JSON.stringify(l.unavailable)}`,
          );
          assert.ok(l.overflow <= 0, `${screen} @${width} ${status}: overflow ${l.overflow}px`);
          assert.deepEqual(l.tooSmall, [], `${screen} @${width} ${status}: text below 11px`);
          assert.deepEqual(errors, [], `${screen} @${width} ${status}: page errors`);
          await page.close();
          views++;
        }
      }
    }
    // Direct links normalize casing, preserve ranges, handle reserved symbols and reject bad input.
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.route(
        (url) => Boolean(isApi(url)),
        (route) => {
          const url = new URL(route.request().url());
          const [, source] = isApi(url);
          const body = typeof source === "function" ? source(url) : source;
          return route.fulfill({ json: typeof body === "string" ? fixtures[body] : body });
        },
      );
      await page.goto(`${baseUrl}/markets/simf?range=5Y`);
      await page.waitForURL(/\/markets\/SIMF\?range=5Y/);
      await page.locator(".mk-candles svg").waitFor();
      assert.equal(
        await page.getByRole("radio", { name: "5Y", exact: true }).getAttribute("aria-checked"),
        "true",
      );
      await page.goto(`${baseUrl}/markets?ticker=RISK`);
      await page.getByRole("heading", { name: "RISK", exact: true }).waitFor();
      await page.locator(".mk-candles svg").waitFor();
      await page.goto(`${baseUrl}/markets/BAD%3B`);
      await page.getByRole("alert").filter({ hasText: "Invalid ticker" }).waitFor();
      assert.equal(await page.locator(".mk-candles").count(), 0);
      await page.close();
      views += 3;
    }
  } finally {
    await browser.close();
  }
  console.log(
    `${views} Markets views checked at 1440 and 390 px: data, failure and signed-out states, no overflow, no text below 11px`,
  );
}
