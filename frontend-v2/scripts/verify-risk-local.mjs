// SYNTHETIC_TEST_ONLY engineering verification. No provider, model fit or retained study.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
const repo = fileURLToPath(new URL("../../", import.meta.url));
const read = (file) => readFileSync(new URL("../src/lib/" + file, import.meta.url), "utf8");
let mode = "replay",
  userId = 1,
  authFails = false,
  paperFails = false;
let held = [
  { symbol: "AAPL", qty: 2, entry: 100 },
  { symbol: "MSFT", qty: 3, entry: 200 },
];
let calls = [],
  writes = [],
  listeners = [];
const storage = new Map([
  ["finsight.demoBook.v1", JSON.stringify([{ symbol: "OTHER_ACCOUNT", qty: 999, entry: 999 }])],
  ["finsight.paperBook.v2:1", JSON.stringify([{ symbol: "AAPL", qty: 2, entry: 100 }])],
]);
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
};
const context = vm.createContext({
  window: { location: { hostname: "localhost" } },
  localStorage,
  AbortController,
  DOMException,
  setTimeout,
  clearTimeout,
  console,
  __env: { VITE_ENABLE_LOCAL_LIVE: "true" },
  fetch: async (url, init) => {
    const path = new URL(url).pathname;
    calls.push(path);
    if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (path === "/auth/me")
      return new Response(
        JSON.stringify(
          authFails
            ? { detail: "Fixture unauthorized" }
            : { id: userId, email: "fixture@example.invalid" },
        ),
        { status: authFails ? 401 : 200 },
      );
    if (path === "/paper/positions") {
      assert.equal(
        init.headers["X-FinSight-Paper-Owner"],
        String(userId),
        "Every paper request binds its verified owner",
      );
      if (init?.method === "PUT") {
        writes.push(JSON.parse(init.body));
        held = JSON.parse(init.body).positions;
      }
      return new Response(
        JSON.stringify(paperFails ? { detail: "Fixture offline" } : { positions: held }),
        { status: paperFails ? 503 : 200 },
      );
    }
    if (path === "/fixture-unauthorized")
      return new Response('{"detail":"Fixture unauthorized"}', { status: 401 });
    throw new Error("Forbidden unexpected fixture API call: " + path);
  },
});
const modules = {
  "@/replay/mode": {
    getDataMode: () => mode,
    localLiveAllowed: () =>
      context.window.location.hostname === "localhost" &&
      context.__env.VITE_ENABLE_LOCAL_LIVE === "true",
  },
  "@/replay/client": {
    readReplayRoute: () => {
      throw new Error("Paper hydration touched Replay");
    },
  },
};
function load(name, source) {
  const transformed = ts.transpileModule(source.replaceAll("import.meta.env", "__env"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInContext("(function(exports, require) { " + transformed + "\n})", context, {
    filename: name,
  })(exports, (id) => {
    assert(id in modules, "Unexpected import " + id);
    return modules[id];
  });
  return exports;
}
const api = load("api.ts", read("api.ts"));
modules["./api"] = api;
const demo = load("demoBook.ts", read("demoBook.ts"));
modules["./demoBook"] = demo;
modules["./market"] = {
  unavailableInstrument: (symbol) => ({ name: symbol, beta: 1, annualVol: 0.25 }),
};
const book = load("book.ts", read("book.ts"));
const normalized = (value) => JSON.parse(JSON.stringify(value));
const check = (a, b) => assert.deepEqual(normalized(a), normalized(b));
check(demo.getDemoBook(), []);
demo.subscribeDemoBook(() => {});
demo.subscribeDemoBookStatus((status) => listeners.push(status));
assert.equal(calls.length, 0, "Imports/subscriptions cannot hydrate Replay or show global cache");
await demo.activatePaperBookBoundary();
assert.equal(calls.length, 0);
mode = "live";
await demo.activatePaperBookBoundary();
check(calls, ["/auth/me", "/paper/positions"]);
check(demo.getDemoBook(), held);
assert.equal(book.getBook().positions.length, 0);
assert.equal(book.getBook().unpriced.length, 2);
const quote = { mark: 110, source: "FINNHUB", quote_ts: "2026-10-13T15:00:00Z", live: true };
book.updateBookMarks({ AAPL: quote, MSFT: 200 });
assert.equal(book.getBook().positions.length, 1, "Bare marks cannot count as quoted");
assert.equal(book.getBook().unpriced.length, 1);
assert.equal(book.getBook().nav, 220);
assert.equal(book.getBook().positions[0].quoteObservedAt, "2026-10-13T15:00:00.000Z");
assert.equal(book.admittedQuote({ ...quote, source: "UNKNOWN" }), false);
assert.equal(book.admittedQuote({ ...quote, quote_ts: "" }), false);
assert.equal(book.admittedQuote({ ...quote, quote_ts: "2026-10-13T15:00:00" }), false);
assert.equal(book.admittedQuote({ ...quote, quote_ts: "2026-02-31T15:00:00Z" }), false);
assert.equal(book.admittedQuote({ ...quote, quote_ts: "2026-02-31" }), false);
assert.equal(book.admittedQuote({ ...quote, mark: NaN }), false);
assert.equal(book.quoteObservedAt("2026-10-13"), "2026-10-13", "No invented EOD observation hour");
let emissions = 0;
const stop = book.subscribe(() => emissions++);
const before = emissions;
book.updateBookMarks({ AAPL: { ...quote } });
assert.equal(emissions, before, "An unchanged snapshot cannot create a render loop");
const baseVar = book.var1d(book.getBook(), "FAT_TAIL_PROXY", 0.99);
book.applyHedge("TEST_ONLY_OPTION", [
  {
    ...book.getBook().positions[0],
    id: "TEST_OPTION",
    cls: "OPTION",
    symbol: "TEST_OPTION",
    mark: 3,
    mv: 300,
    qty: 1,
    gross: 300,
    riskNotional: -50,
  },
]);
assert.equal(book.getBook().positions.length, 1);
assert.equal(book.getScenarioBook().positions.length, 2);
check(book.var1d(book.getBook(), "FAT_TAIL_PROXY", 0.99), baseVar);
book.updateBookMarks({});
assert.equal(book.getBook().positions.length, 0);
assert.equal(book.getBook().unpriced.length, 2, "A removed snapshot invalidates old coverage");
stop();

// Compare every estimator and stress result to the unchanged canonical implementation.
// This is a small SYNTHETIC_TEST_ONLY fixture, never retained scientific evidence.
const baseline = spawnSync(
  "git",
  ["show", "16db82c5f2f50b98253df9989c586cd45aa98f6b:frontend-v2/src/lib/book.ts"],
  { cwd: repo, encoding: "utf8" },
);
assert.equal(baseline.status, 0, baseline.stderr);
const old = load("canonical-book.ts", baseline.stdout);
const position = {
  id: "TEST_EQ",
  cls: "EQUITY",
  symbol: "TEST_EQ",
  name: "TEST ONLY",
  qty: 2,
  entry: 100,
  mark: 110,
  pnl: 20,
  mv: 220,
  gross: 220,
  sector: "Technology",
  beta: 1.2,
  vol: 0.3,
};
const fixture = {
  positions: [
    position,
    {
      ...position,
      id: "TEST_SHORT",
      cls: "COMMODITY",
      symbol: "CL",
      qty: -1,
      mv: -75,
      gross: 75,
      vol: 0.32,
    },
  ],
  unpriced: [],
  nav: 500,
  gross: 295,
  net: 145,
  long: 220,
  short: -75,
  pnlDay: 20,
  updatedAt: 1,
};
for (const [current, original] of [
  ["PARAMETRIC", "PARAMETRIC"],
  ["FAT_TAIL_PROXY", "HISTORICAL"],
  ["MONTE_CARLO", "MONTE_CARLO"],
]) {
  for (const confidence of [0.95, 0.99])
    check(book.var1d(fixture, current, confidence), old.var1d(fixture, original, confidence));
}
check(
  book.stress(fixture, { equityPct: -0.2, oilPct: 0.1, ratesBp: 50 }),
  old.stress(fixture, { equityPct: -0.2, oilPct: 0.1, ratesBp: 50 }),
);

book.updateBookMarks({ AAPL: quote });
demo.addDemoPosition({ symbol: "SPY", qty: 1, entry: 100 });
demo.resetPaperBookBoundary();
await new Promise((resolve) => setTimeout(resolve, 420));
assert.equal(writes.length, 0, "Boundary reset cancels delayed writes");
assert.equal(book.quotedMark("AAPL"), null, "Boundary reset removes old account marks");
check(demo.getDemoBook(), []);
userId = 2;
held = [];
await demo.activatePaperBookBoundary(); // API detects changed identity and clears the old session.
await demo.activatePaperBookBoundary();
check(demo.getDemoBook(), []);
assert.equal(book.getBook().positions.length, 0);
storage.set("finsight.paperBook.v2:2", JSON.stringify([{ symbol: "MSFT", qty: 1, entry: 200 }]));
demo.resetPaperBookBoundary();
paperFails = true;
await demo.activatePaperBookBoundary();
check(demo.getDemoBook(), [{ symbol: "MSFT", qty: 1, entry: 200 }]);
assert.equal(listeners.at(-1).state, "offline");
await assert.rejects(api.api("/fixture-unauthorized"), (error) => error.status === 401);
check(demo.getDemoBook(), []);
assert.equal(listeners.at(-1).state, "auth_required");
paperFails = false;
authFails = true;
await demo.activatePaperBookBoundary();
check(demo.getDemoBook(), []);
const at = calls.length;
mode = "replay";
demo.resetPaperBookBoundary();
await demo.activatePaperBookBoundary();
assert.equal(calls.length, at);
mode = "live";
context.window.location.hostname = "example.invalid";
await demo.activatePaperBookBoundary();
assert.equal(calls.length, at);
const proof = {
  schema_version: "risk-local-proof/1",
  evidence_class: "SYNTHETIC_TEST_ONLY",
  status: "PASS",
  estimator_comparisons: 6,
  no_provider_calls: true,
  no_retained_scientific_evidence: true,
  replay_hydration_calls: 0,
  cancelled_delayed_writes: writes.length,
  identity_and_quote_boundary: "VERIFIED",
};
mkdirSync(new URL("../../.tmp/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../../.tmp/risk-local-proof.json", import.meta.url),
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(JSON.stringify(proof));
