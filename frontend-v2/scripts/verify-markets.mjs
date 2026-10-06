import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import {
  adaptBacktest,
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
} from "../src/markets/contracts.ts";
import {
  bandPath,
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
import { num, pct, stamp } from "../src/markets/format.ts";

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

  const settle = (page) =>
    page.waitForFunction(() => !document.querySelector(".mk-loading"), null, { timeout: 30000 });
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
        page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
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
        await page.goto(`${baseUrl}/markets/${screen}?ticker=SIMF`, { waitUntil: "load" });
        await page.waitForSelector(".mk-panel");
        await settle(page);
        if (spec.act) await spec.act(page);
        await settle(page);
        // Actions start requests; wait for what they render rather than racing the spinner.
        for (const selector of spec.expect)
          await page
            .locator(selector)
            .first()
            .waitFor({ state: "visible", timeout: 30000 })
            .catch(() => assert.fail(`${screen} @${width}: ${selector} not rendered`));
        await settle(page);
        const l = await layout(page);
        assert.deepEqual(l.unavailable, [], `${screen} @${width}: unexpected unavailable state`);
        assert.ok(l.overflow <= 0, `${screen} @${width}: page overflows by ${l.overflow}px`);
        assert.deepEqual(l.tooSmall, [], `${screen} @${width}: text below 11px`);
        assert.deepEqual(errors, [], `${screen} @${width}: console errors`);
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
          await page.goto(`${baseUrl}/markets/${screen}?ticker=SIMF`, { waitUntil: "load" });
          await page.waitForSelector(".mk-panel");
          if (screen === "research") {
            await page.getByRole("button", { name: "Index latest filing" }).click();
          }
          await settle(page);
          const l = await layout(page);
          assert.ok(l.panels > 0, `${screen} @${width} ${status}: blank page`);
          assert.ok(
            l.unavailable.length > 0 && l.unavailable.every((t) => expectText.test(t)),
            `${screen} @${width} ${status}: ${JSON.stringify(l.unavailable)}`,
          );
          assert.ok(l.overflow <= 0, `${screen} @${width} ${status}: overflow ${l.overflow}px`);
          assert.deepEqual(errors, [], `${screen} @${width} ${status}: page errors`);
          await page.close();
          views++;
        }
      }
    }
  } finally {
    await browser.close();
  }
  console.log(
    `${views} Markets views checked at 1440 and 390 px: data, failure and signed-out states, no overflow, no text below 11px`,
  );
}
