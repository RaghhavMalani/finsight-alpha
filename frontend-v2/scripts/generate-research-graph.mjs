/**
 * Build-time projection of the frozen Research OS evidence into one content-addressed
 * graph document for the F6 Research workspace.
 *
 * Reads only sealed files under data/exports/research_os_v0_1 and research_os_v0_1_1,
 * checks every byte against its export manifest, and emits:
 *   public/research/graph.<sha16>.json    the projection (never edited by hand)
 *   src/research/pin.generated.ts         the expected file name and SHA-256, compiled
 *                                          into the route so the browser can refuse a
 *                                          tampered or substituted document.
 * Every number in the projection carries its source file key and a JSON pointer into
 * that file. Nothing is computed here except the derivations named in a `formula`.
 * If a source is missing or does not match its manifest, the emitted document says
 * UNAVAILABLE and why; the page then says so instead of drawing a graph.
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const repo = resolve(frontend, "..");
const outDir = resolve(frontend, "public", "research");
const pinPath = resolve(frontend, "src", "research", "pin.generated.ts");

const SCHEMA = "research-graph/1";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const ROOTS = {
  "v0.1": "data/exports/research_os_v0_1",
  "v0.1.1": "data/exports/research_os_v0_1_1",
};
/** Source key → [export root, file]. Each is sealed by that root's manifest.json. */
const FILES = {
  "v0.1/preregistration.json": ["v0.1", "preregistration.json"],
  "v0.1/flagship.json": ["v0.1", "flagship.json"],
  "v0.1/calibration.json": ["v0.1", "calibration.json"],
  "v0.1/mutations.json": ["v0.1", "mutations.json"],
  "v0.1/repeatability.json": ["v0.1", "repeatability.json"],
  "v0.1/final-tests.json": ["v0.1", "final-tests.json"],
  "v0.1/tests.json": ["v0.1", "tests.json"],
  "v0.1/freeze-receipt.json": ["v0.1", "freeze-receipt.json"],
  "v0.1/publication.json": ["v0.1", "publication.json"],
  "v0.1.1/freeze-receipt.json": ["v0.1.1", "freeze-receipt.json"],
  "v0.1.1/discovery.json": ["v0.1.1", "discovery.json"],
  "v0.1.1/selection.json": ["v0.1.1", "selection.json"],
  "v0.1.1/confirmation.json": ["v0.1.1", "confirmation.json"],
  "v0.1.1/summary.json": ["v0.1.1", "summary.json"],
  "v0.1.1/pre-confirmation-guard-repair.json": ["v0.1.1", "pre-confirmation-guard-repair.json"],
  "v0.1.1/pre-confirmation-rejection.log": ["v0.1.1", "pre-confirmation-rejection.log"],
};
/** The repository's freeze inventory that already seals both export manifests by SHA-256. */
const FREEZE = "eval/factors/v0.1/phase5-freeze.json";

class Unavailable extends Error {}

function loadSources() {
  const manifests = {};
  const freezePath = resolve(repo, FREEZE);
  if (!existsSync(freezePath)) throw new Unavailable(`${FREEZE} is not present`);
  const freezeBytes = readFileSync(freezePath);
  const freeze = JSON.parse(freezeBytes);
  for (const [version, dir] of Object.entries(ROOTS)) {
    const path = resolve(repo, dir, "manifest.json");
    if (!existsSync(path)) throw new Unavailable(`${dir}/manifest.json is not present`);
    const bytes = readFileSync(path);
    const digest = sha256(bytes),
      anchored = freeze.files?.[`${dir}/manifest.json`]?.sha256;
    // The manifest itself is anchored in the freeze inventory, so a rewritten manifest
    // cannot re-seal edited evidence.
    if (anchored !== digest)
      throw new Unavailable(
        `${dir}/manifest.json SHA-256 ${digest.slice(0, 12)}… is not the one sealed in ${FREEZE}`,
      );
    manifests[version] = { dir, bytes, sha256: digest, json: JSON.parse(bytes) };
  }
  manifests.freeze = { path: FREEZE, sha256: sha256(freezeBytes), bytes: freezeBytes.length };
  const sources = {},
    docs = {};
  for (const [key, [version, file]] of Object.entries(FILES)) {
    const m = manifests[version],
      path = resolve(repo, m.dir, file);
    if (!existsSync(path)) throw new Unavailable(`${m.dir}/${file} is not present`);
    const bytes = readFileSync(path),
      digest = sha256(bytes),
      sealed = m.json.files?.[file];
    if (!sealed) throw new Unavailable(`${m.dir}/manifest.json does not seal ${file}`);
    if (sealed !== digest)
      throw new Unavailable(
        `${m.dir}/${file} SHA-256 ${digest.slice(0, 12)}… does not match its manifest ${sealed.slice(0, 12)}…`,
      );
    sources[key] = {
      path: `${m.dir}/${file}`,
      sha256: digest,
      bytes: bytes.length,
      sealed_by: `${m.dir}/manifest.json`,
      manifest_sha256: m.sha256,
    };
    docs[key] = file.endsWith(".json")
      ? JSON.parse(bytes.toString("utf8"))
      : bytes.toString("utf8");
  }
  return { sources, docs, manifests };
}

/** RFC 6901 pointer for a path of keys. */
const ptr = (path) =>
  "/" + path.map((k) => String(k).replace(/~/g, "~0").replace(/\//g, "~1")).join("/");

function at(doc, path) {
  let v = doc;
  for (const k of path) {
    if (v == null || typeof v !== "object" || !(k in v)) return undefined;
    v = v[k];
  }
  return v;
}

/** cp1252-misread UTF-8 dashes present in the frozen text; repaired and disclosed. */
function repair(text) {
  const fixed = text.replace(/â€“/g, "–").replace(/â€”/g, "—");
  return fixed === text
    ? { t: text }
    : { t: fixed, repaired: "UTF-8 dash misdecoded as cp1252 in source; shown repaired" };
}

/** Inverse standard normal CDF (Acklam), |error| < 1.2e-9. */
function invNorm(p) {
  const a = [
    -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = p < 0.5 ? p : 1 - p;
  let x;
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    x =
      (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) /
      ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  } else {
    const r = q - 0.5,
      t = r * r;
    x =
      ((((((a[0] * t + a[1]) * t + a[2]) * t + a[3]) * t + a[4]) * t + a[5]) * r) /
      (((((b[0] * t + b[1]) * t + b[2]) * t + b[3]) * t + b[4]) * t + 1);
    return p < 0.5 ? x : -x;
  }
  return p < 0.5 ? x : -x;
}

/** Error function by its Maclaurin series (double precision for |x| < 6). */
function erf(x) {
  if (Math.abs(x) > 6) return Math.sign(x);
  let sum = 0,
    term = x;
  for (let n = 0; n < 120; n++) {
    sum += term / (2 * n + 1);
    term *= (-x * x) / (n + 1);
  }
  return (2 / Math.sqrt(Math.PI)) * sum;
}

/** One- or two-sided by relative tolerance; null when neither or both reproduce the sealed p. */
function sidedness(p, one, two) {
  const near = (q) => Math.abs(p - q) <= 1e-3 * Math.max(Math.abs(q), 1e-9) + 1e-12;
  const a = near(one),
    b = near(two);
  return a && !b ? "one-sided" : b && !a ? "two-sided" : null;
}

function build({ sources, docs, manifests }) {
  const pre = docs["v0.1/preregistration.json"],
    flag = docs["v0.1/flagship.json"],
    cal = docs["v0.1/calibration.json"],
    mut = docs["v0.1/mutations.json"],
    rep = docs["v0.1/repeatability.json"],
    tests = docs["v0.1/final-tests.json"],
    receipt = docs["v0.1/freeze-receipt.json"],
    pub = docs["v0.1/publication.json"],
    skFreeze = docs["v0.1.1/freeze-receipt.json"],
    disc = docs["v0.1.1/discovery.json"],
    sel = docs["v0.1.1/selection.json"],
    conf = docs["v0.1.1/confirmation.json"],
    summary = docs["v0.1.1/summary.json"],
    guard = docs["v0.1.1/pre-confirmation-guard-repair.json"],
    rejectionLog = docs["v0.1.1/pre-confirmation-rejection.log"],
    suite = docs["v0.1/tests.json"];

  // The primary test's alpha and alternative come from the preregistration; the rule
  // that turns a record into a state is shown with its inputs in every trial's panel.
  const primaryTest = pre.tests.findIndex((t) => t.method === "HAC");
  if (primaryTest < 0 || pre.tests[primaryTest].alternative !== "greater")
    throw new Unavailable("Preregistration has no one-sided HAC primary test");
  const ALPHA = pre.tests[primaryTest].alpha;
  const alphaNum = {
    v: ALPHA,
    src: "v0.1/preregistration.json",
    ptr: ptr(["tests", primaryTest, "alpha"]),
    fmt: "p",
  };
  const zCrit = {
    v: invNorm(1 - ALPHA),
    src: "v0.1/preregistration.json",
    ptr: ptr(["tests", primaryTest, "alpha"]),
    ptr2: ptr(["tests", primaryTest, "alternative"]),
    fmt: "x",
    formula: "Φ⁻¹(1 − α): one-sided critical value of the asymptotic normal HAC test",
  };
  const Z975 = invNorm(0.975);
  const zCrit2 = {
    v: invNorm(1 - ALPHA / 2),
    src: "v0.1/preregistration.json",
    ptr: ptr(["tests", primaryTest, "alpha"]),
    fmt: "x",
    formula:
      "Φ⁻¹(1 − α/2): two-sided critical value at the same α, for trials whose sealed p is two-sided",
  };

  /** A number with provenance. `null` stays null with a reason; missing is never zero. */
  const num = (src, path, fmt, extra = {}) => {
    const v = at(docs[src], path);
    if (v !== null && v !== undefined && typeof v !== "number")
      throw new Unavailable(`${src}${ptr(path)} is not a number`);
    return {
      v: v ?? null,
      src,
      ptr: ptr(path),
      fmt,
      ...(v == null ? { reason: v === null ? "Recorded as null" : "Field absent in source" } : {}),
      ...extra,
    };
  };
  const txt = (src, path, extra = {}) => {
    const v = at(docs[src], path);
    if (v == null) return { t: null, src, ptr: ptr(path), reason: "Field absent in source" };
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return { ...repair(s), src, ptr: ptr(path), ...extra };
  };
  const ev = (atSrc, atPath, node, kind, label) => {
    const when = at(docs[atSrc], atPath);
    if (typeof when !== "string") throw new Unavailable(`${atSrc}${ptr(atPath)} has no timestamp`);
    return { at: when, node, kind, label, src: atSrc, ptr: ptr(atPath) };
  };

  const nodes = [],
    edges = [],
    timeline = [];
  const node = (n) => (nodes.push(n), n);
  const edge = (from, to, kind, src, path) => edges.push({ from, to, kind, src, ptr: ptr(path) });

  // Hypothesis -------------------------------------------------------------------------------
  const H = "H";
  const hyp = pre.hypothesis;
  node({
    id: H,
    kind: "hypothesis",
    group: "core",
    label: txt("v0.1/preregistration.json", ["hypothesis", "name"]),
    hash: {
      v: flag.dag.nodes.find((n) => n.kind === "HYPOTHESIS").id,
      src: "v0.1/flagship.json",
      ptr: ptr(["dag", "nodes", 0, "id"]),
    },
    state: "frozen",
    model: txt("v0.1/preregistration.json", ["hypothesis", "interpretation"]),
    facts: [
      { k: "Dependent", t: txt("v0.1/preregistration.json", ["hypothesis", "dependent"]) },
      { k: "Independent", t: txt("v0.1/preregistration.json", ["hypothesis", "independent"]) },
      { k: "Controls", t: txt("v0.1/preregistration.json", ["hypothesis", "controls"]) },
      { k: "Universe", t: txt("v0.1/preregistration.json", ["hypothesis", "universe"]) },
      { k: "Null", t: txt("v0.1/preregistration.json", ["hypothesis", "null"]) },
      { k: "Alternative", t: txt("v0.1/preregistration.json", ["hypothesis", "alternative"]) },
      {
        k: "Primary endpoint",
        t: txt("v0.1/preregistration.json", ["hypothesis", "primary_endpoint"]),
      },
      { k: "Minimum effect", n: num("v0.1/preregistration.json", ["minimum_effect"], "ret") },
      { k: "Prospective σ", n: num("v0.1/preregistration.json", ["prospective_sigma"], "ret") },
      { k: "Acceptance", t: txt("v0.1/preregistration.json", ["acceptance"]) },
      ...hyp.falsification.map((_, i) => ({
        k: `Falsifier`,
        t: txt("v0.1/preregistration.json", ["hypothesis", "falsification", i]),
      })),
    ],
  });
  timeline.push(
    ev("v0.1/flagship.json", ["attempts", 0, "at"], H, "freeze", "Preregistration frozen"),
  );

  // Questions: the four scorecard claims the preregistration tests ---------------------------
  const DIMS = ["STATISTICAL", "CROSS_MARKET", "REGIME_DEPENDENCE", "ECONOMIC"];
  const reasonFor = {
    STATISTICAL: /primar/i,
    CROSS_MARKET: /both frozen country/i,
    REGIME_DEPENDENCE: /regime/i,
    ECONOMIC: /economic/i,
  };
  for (const d of DIMS) {
    const verdict = flag.scorecard[d];
    const reasons = flag.scorecard.reasons
      .map((r, i) => [r, i])
      .filter(([r]) => reasonFor[d].test(r))
      .map(([, i]) => ({ k: "Reason", t: txt("v0.1/flagship.json", ["scorecard", "reasons", i]) }));
    node({
      id: `Q:${d}`,
      kind: "question",
      group: "question",
      label: {
        t: d.replace(/_/g, " ").toLowerCase(),
        src: "v0.1/flagship.json",
        ptr: ptr(["scorecard", d]),
      },
      verdict: txt("v0.1/flagship.json", ["scorecard", d]),
      state:
        verdict === "UNAVAILABLE"
          ? "unavailable"
          : verdict === "SUPPORTED"
            ? "verified"
            : "inconclusive",
      facts: reasons,
    });
    edge(H, `Q:${d}`, "QUESTION", "v0.1/flagship.json", ["scorecard", d]);
  }

  // Runs: the 46 frozen trials ------------------------------------------------------------------
  // The preregistered regime rule, judged once across all four contrasts and the controls.
  const holmOf = (id) => flag.records[id]?.payload?.correction?.HOLM;
  const contrasts = ["US:HMM", "US:VOL_CLUSTER", "INDIA:HMM", "INDIA:VOL_CLUSTER"];
  const controls = Object.keys(flag.records).filter((id) =>
    /:(WRONG_DIRECTION|SHUFFLED_REGIME_HMM|SHUFFLED_REGIME_VOL)$/.test(id),
  );
  const regimeK = contrasts.filter((id) => holmOf(id) != null && holmOf(id) <= ALPHA).length;
  const regimeMissing = [...contrasts, ...controls].some((id) => holmOf(id) == null);
  const regimeRule = {
    k: regimeK,
    // Missing is not "not met": any absent Holm p leaves the rule unavailable.
    met: regimeMissing ? null : regimeK === 4 && controls.every((id) => !(holmOf(id) <= ALPHA)),
  };
  const dagIndex = new Map(flag.dag.edges.map((e, i) => [e.to, i]));
  const attemptsByRun = new Map();
  flag.attempts.forEach((a, i) => {
    const run = a.payload?.run_hash;
    if (a.attempt) attemptsByRun.set(a.attempt, [...(attemptsByRun.get(a.attempt) ?? []), i]);
    void run;
  });
  // Hash-chain linkage: each event names the previous event's hash.
  flag.attempts.forEach((a, i) => {
    if (i > 0 && a.previous !== flag.attempts[i - 1].hash)
      throw new Unavailable(`flagship.json attempt chain breaks at sequence ${a.sequence}`);
  });
  const order = flag.dag.nodes.map((n, i) => [n, i]).filter(([n]) => n.kind === "RUN");
  for (const [dn, di] of order) {
    const trial = dn.trial_id,
      rec = flag.records[trial],
      R = `R:${trial}`,
      ei = dagIndex.get(dn.id),
      kind = flag.dag.edges[ei].kind,
      base = ["records", trial],
      P = [...base, "payload"],
      res = rec.payload.result,
      corr = rec.payload.correction;
    const idx = attemptsByRun.get(rec.attempt) ?? [];
    const iStart = idx.find((i) => flag.attempts[i].kind === "START"),
      iOpen = idx.find((i) => flag.attempts[i].kind === "HOLDOUT_OPEN"),
      iDone = idx.find((i) => flag.attempts[i].kind === "SUCCESS");
    const holm = corr.HOLM,
      supported = res.status !== "UNAVAILABLE" && holm != null && holm <= ALPHA && res.ci_lower > 0;
    const counterfactual = kind === "PLACEBO";
    const variant0 = trial.split(":")[1];
    // Sidedness is read from the sealed record: its p equals either 1 − Φ(t) or 2(1 − Φ(|t|)).
    const tval =
      res.status === "UNAVAILABLE"
        ? null
        : res.estimate / ((res.ci_upper - res.ci_lower) / (2 * Z975));
    const phi = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
    const sided =
      tval == null ? null : sidedness(res.p_value, 1 - phi(tval), 2 * (1 - phi(Math.abs(tval))));
    // A rule is shown only where the preregistration text covers this trial.
    const ruleKind =
      res.status === "UNAVAILABLE"
        ? null
        : variant0 === "PRIMARY"
          ? "acceptance"
          : variant0 === "HMM" || variant0 === "VOL_CLUSTER"
            ? "regime"
            : variant0 === "WRONG_DIRECTION" || variant0.startsWith("SHUFFLED_REGIME")
              ? "specificity"
              : null;
    const passes = holm != null && holm <= ALPHA;
    const met = ruleKind === "acceptance" ? supported : ruleKind ? passes : null;
    // A single regime contrast never verifies on its own: the preregistered rule needs both
    // models in both markets after Holm and every specificity control failing to pass.
    const state =
      res.status === "UNAVAILABLE"
        ? "unavailable"
        : ruleKind === "specificity"
          ? met
            ? "falsified"
            : "held"
          : ruleKind === "regime"
            ? regimeRule.met == null
              ? "recorded"
              : regimeRule.met
                ? "verified"
                : "inconclusive"
            : ruleKind
              ? met
                ? "verified"
                : "inconclusive"
              : "recorded";
    const [country, variant] = trial.split(":");
    const wall =
      iStart != null && iDone != null
        ? {
            v: (Date.parse(flag.attempts[iDone].at) - Date.parse(flag.attempts[iStart].at)) / 1000,
            src: "v0.1/flagship.json",
            ptr: ptr(["attempts", iDone, "at"]),
            ptr2: ptr(["attempts", iStart, "at"]),
            fmt: "sec",
            formula: "SUCCESS.at − START.at for this attempt",
          }
        : {
            v: null,
            src: "v0.1/flagship.json",
            ptr: ptr(["attempts"]),
            fmt: "sec",
            reason: "Attempt events absent",
          };
    const facts = [
      {
        k: "Estimate · monthly intercept",
        n: num("v0.1/flagship.json", [...P, "result", "estimate"], "ret"),
      },
      { k: "95% CI lower", n: num("v0.1/flagship.json", [...P, "result", "ci_lower"], "ret") },
      { k: "95% CI upper", n: num("v0.1/flagship.json", [...P, "result", "ci_upper"], "ret") },
      { k: "Raw p", n: num("v0.1/flagship.json", [...P, "result", "p_value"], "p") },
      { k: "Observations", n: num("v0.1/flagship.json", [...P, "result", "n"], "int") },
    ];
    if (res.status === "UNAVAILABLE")
      facts.unshift({ k: "Unavailable", t: txt("v0.1/flagship.json", [...P, "result", "reason"]) });
    else
      facts.push(
        { k: "Period start", t: txt("v0.1/flagship.json", [...P, "period_start"]) },
        { k: "Period end", t: txt("v0.1/flagship.json", [...P, "period_end"]) },
        { k: "Prospective power", n: num("v0.1/flagship.json", [...P, "power", "power"], "rate") },
        { k: "MDE at 80% power", n: num("v0.1/flagship.json", [...P, "power", "mde_80"], "ret") },
        {
          k: "Sample Sharpe (monthly)",
          n: num("v0.1/flagship.json", [...P, "sharpe", "sample_sharpe"], "x"),
        },
        { k: "Mean net return", n: num("v0.1/flagship.json", [...P, "mean_net_return"], "ret") },
      );
    const model =
      res.status === "UNAVAILABLE" ? null : txt("v0.1/flagship.json", [...P, "result", "method"]);
    node({
      id: R,
      kind: counterfactual ? "counterfactual" : "experiment",
      group: kind,
      country,
      label: {
        t: `${country} · ${variant.replace(/_/g, " ").toLowerCase()}`,
        src: "v0.1/flagship.json",
        ptr: ptr(["dag", "nodes", di, "trial_id"]),
      },
      run_id: { v: dn.id, src: "v0.1/flagship.json", ptr: ptr(["dag", "nodes", di, "id"]) },
      hash: {
        v: rec.artifact_hash,
        src: "v0.1/flagship.json",
        ptr: ptr([...base, "artifact_hash"]),
      },
      world: {
        v: rec.artifact.payload_sha256,
        src: "v0.1/flagship.json",
        ptr: ptr([...base, "artifact", "payload_sha256"]),
      },
      edgeKind: kind,
      sided: sided
        ? {
            t: sided,
            src: "v0.1/flagship.json",
            ptr: ptr([...P, "result", "p_value"]),
            note: "Read by comparing the sealed p with 1 − Φ(t) and 2(1 − Φ(|t|))",
          }
        : null,
      rule: !ruleKind
        ? null
        : {
            text:
              ruleKind === "acceptance"
                ? "Supported iff Holm-adjusted p ≤ α and the 95% CI lower bound > 0 (preregistration acceptance rule)."
                : ruleKind === "regime"
                  ? `Contributes to the preregistered regime rule: both models in both markets need Holm-adjusted p ≤ α and every wrong-direction or shuffled-regime control must fail to pass (${regimeRule.k} of 4 contrasts met; this one ${passes ? "met" : "not met"}).`
                  : "Specificity is broken iff this wrong-direction or shuffled-regime control has Holm-adjusted p ≤ α; held when it does not.",
            src: "v0.1/preregistration.json",
            ptr:
              ruleKind === "acceptance"
                ? ptr(["acceptance"])
                : ruleKind === "regime"
                  ? ptr(["hypothesis", "falsification", 1])
                  : ptr(["hypothesis", "falsification", 2]),
            inputs: [
              { k: "α (primary test)", n: alphaNum },
              {
                k: "Holm-adjusted p",
                n: num("v0.1/flagship.json", [...P, "correction", "HOLM"], "p"),
              },
              ...(ruleKind === "acceptance"
                ? [
                    {
                      k: "95% CI lower",
                      n: num("v0.1/flagship.json", [...P, "result", "ci_lower"], "ret"),
                    },
                  ]
                : []),
            ],
            met: ruleKind === "regime" ? regimeRule.met : met,
          },
      t:
        res.status === "UNAVAILABLE"
          ? null
          : {
              v: res.estimate / ((res.ci_upper - res.ci_lower) / (2 * Z975)),
              src: "v0.1/flagship.json",
              ptr: ptr([...P, "result", "estimate"]),
              ptr2: ptr([...P, "result", "ci_upper"]) + " and " + ptr([...P, "result", "ci_lower"]),
              fmt: "x",
              formula:
                "estimate ÷ SE, SE = (CI upper − CI lower) ÷ (2 × Φ⁻¹(0.975)); the record states an asymptotic normal 95% CI",
            },
      state,
      model,
      cost: [
        { k: "Wall time", n: wall },
        ...(rec.payload.assumed_cost_bps != null
          ? [
              {
                k: "Assumed trading cost",
                n: num("v0.1/flagship.json", [...P, "assumed_cost_bps"], "bps"),
              },
            ]
          : []),
        {
          k: "Model tokens / $",
          t: {
            t: null,
            src: "v0.1/flagship.json",
            ptr: ptr([...base, "run"]),
            reason: "Statistical run with no language model; token cost not recorded",
          },
        },
      ],
      verdicts: [
        {
          k: "Holm, whole trial family",
          n: num("v0.1/flagship.json", [...P, "correction", "HOLM"], "p"),
        },
        { k: "Benjamini–Hochberg", n: num("v0.1/flagship.json", [...P, "correction", "BH"], "p") },
        ...(rec.payload.secondary_inference
          ? [
              {
                k: "Block bootstrap p",
                n: num(
                  "v0.1/flagship.json",
                  [...P, "secondary_inference", "block_bootstrap", "p_value"],
                  "p",
                ),
              },
            ]
          : []),
        {
          k: "Attempt hash chain",
          t: {
            t: "linked to previous event",
            src: "v0.1/flagship.json",
            ptr: ptr(["attempts", iDone ?? 0, "previous"]),
            note: "Linkage checked at build; event hashes are not recomputed",
          },
        },
      ],
      facts,
    });
    edge(H, R, kind, "v0.1/flagship.json", ["dag", "edges", ei]);
    const fi = pre.family.trial_ids.indexOf(trial);
    if (fi >= 0)
      edge(R, "F", "HOLM_FAMILY", "v0.1/preregistration.json", ["family", "trial_ids", fi]);
    if (iStart != null)
      timeline.push(
        ev("v0.1/flagship.json", ["attempts", iStart, "at"], R, "start", "Run started"),
      );
    if (iOpen != null)
      timeline.push(
        ev("v0.1/flagship.json", ["attempts", iOpen, "at"], R, "holdout", "Holdout opened"),
      );
    if (iDone != null)
      timeline.push(
        ev("v0.1/flagship.json", ["attempts", iDone, "at"], R, "resolve", "Run sealed"),
      );
  }

  // Finding --------------------------------------------------------------------------------------
  node({
    id: "F",
    kind: "finding",
    group: "finding",
    label: { t: "finding · scorecard", src: "v0.1/flagship.json", ptr: ptr(["scorecard"]) },
    verdict: txt("v0.1/flagship.json", ["scorecard", "STATISTICAL"]),
    // Supported only if a scorecard dimension says so; otherwise as the scorecard states.
    state: DIMS.some((d) => flag.scorecard[d] === "SUPPORTED") ? "verified" : "inconclusive",
    finalState: summary.old_gate === "PERMANENTLY_CLOSED" ? "challenged" : undefined,
    facts: [
      ...DIMS.map((d) => ({
        k: d.replace(/_/g, " ").toLowerCase(),
        t: txt("v0.1/flagship.json", ["scorecard", d]),
      })),
      { k: "Calibration", t: txt("v0.1/flagship.json", ["calibration_status"]) },
      { k: "Holdout openings", n: num("v0.1/flagship.json", ["holdout_openings"], "int") },
      { k: "Validated alpha", t: txt("v0.1/flagship.json", ["claims", "validated_alpha"]) },
      {
        k: "Market claim eligible",
        t: txt("v0.1/flagship.json", ["claims", "market_claim_eligible"]),
      },
      { k: "Evidence mode", t: txt("v0.1/flagship.json", ["evidence_mode"]) },
      { k: "Licence", t: txt("v0.1/publication.json", ["licence_status"]) },
      { k: "Publication scope", t: txt("v0.1/publication.json", ["scope"]) },
      { k: "Engine gate after skeptic", t: txt("v0.1.1/summary.json", ["old_gate"]) },
    ],
  });
  edges.push(
    ...DIMS.map((d) => ({
      from: `Q:${d}`,
      to: "F",
      kind: "VERDICT",
      src: "v0.1/flagship.json",
      ptr: ptr(["scorecard", d]),
    })),
  );
  timeline.push(ev("v0.1/flagship.json", ["finished_at"], "F", "resolve", "Scorecard sealed"));
  for (const d of DIMS)
    timeline.push(
      ev("v0.1/flagship.json", ["finished_at"], `Q:${d}`, "resolve", "Verdict recorded"),
    );

  // Verifiers ------------------------------------------------------------------------------------
  node({
    id: "CAL",
    kind: "verifier",
    group: "calibration",
    label: { t: "calibration · v0.1", src: "v0.1/calibration.json", ptr: ptr(["status"]) },
    verdict: txt("v0.1/calibration.json", ["status"]),
    state:
      cal.status === "CALIBRATED"
        ? "verified"
        : cal.status === "NOT_CALIBRATED"
          ? "uncalibrated"
          : "unavailable",
    facts: [
      { k: "Null worlds", n: num("v0.1/calibration.json", ["total_null_worlds"], "int") },
      { k: "Worlds per case", n: num("v0.1/calibration.json", ["worlds_per_case"], "int") },
      {
        k: "Holm family FWER",
        n: num("v0.1/calibration.json", ["family", "holm", "rate"], "rate"),
      },
      { k: "BH family FDR", n: num("v0.1/calibration.json", ["family", "fdr_bh", "rate"], "rate") },
      { k: "Disclosure", t: txt("v0.1/calibration.json", ["disclosure"]) },
    ],
    world: {
      v: cal.generated_data_hash,
      src: "v0.1/calibration.json",
      ptr: ptr(["generated_data_hash"]),
    },
  });
  edge("CAL", "F", "VERIFIES", "v0.1/flagship.json", ["calibration_status"]);
  timeline.push(ev("v0.1/calibration.json", ["started_at"], "CAL", "start", "Calibration started"));
  timeline.push(
    ev("v0.1/calibration.json", ["finished_at"], "CAL", "resolve", "Calibration sealed"),
  );
  for (const name of Object.keys(cal.cases).sort()) {
    const c = cal.cases[name],
      ok = c.null_accepted === true && c.power_accepted === true;
    const part = (v) => (v === true ? "accepted" : v === false ? "rejected" : "unrecorded");
    node({
      id: `CAL:${name}`,
      kind: "check",
      group: "calibration",
      label: {
        t: name.replace(/_/g, " "),
        src: "v0.1/calibration.json",
        ptr: ptr(["cases", name]),
      },
      verdict: {
        t: `null size ${part(c.null_accepted)} · power ${part(c.power_accepted)}`,
        src: "v0.1/calibration.json",
        ptr: ptr(["cases", name, "null_accepted"]),
        note: `and ${ptr(["cases", name, "power_accepted"])}`,
      },
      state: ok ? "verified" : "falsified",
      facts: [
        {
          k: "Null rejection rate",
          n: num("v0.1/calibration.json", ["cases", name, "null", "rate"], "rate"),
        },
        {
          k: "Null 95% CI lower",
          n: num("v0.1/calibration.json", ["cases", name, "null", "ci_lower"], "rate"),
        },
        {
          k: "Null 95% CI upper",
          n: num("v0.1/calibration.json", ["cases", name, "null", "ci_upper"], "rate"),
        },
        {
          k: "Planted detection rate",
          n: num("v0.1/calibration.json", ["cases", name, "planted", "rate"], "rate"),
        },
        { k: "Worlds", n: num("v0.1/calibration.json", ["cases", name, "null", "trials"], "int") },
      ],
    });
    edge(`CAL:${name}`, "CAL", "CASE", "v0.1/calibration.json", ["cases", name]);
    timeline.push(
      ev(
        "v0.1/calibration.json",
        ["finished_at"],
        `CAL:${name}`,
        "resolve",
        ok ? "Case accepted" : "Case rejected",
      ),
    );
  }

  node({
    id: "MUT",
    kind: "verifier",
    group: "mutation",
    label: { t: "mutation tests", src: "v0.1/mutations.json", ptr: ptr(["killed"]) },
    verdict: {
      t: mut.killed === mut.total ? "ALL KILLED" : "SURVIVORS",
      src: "v0.1/mutations.json",
      ptr: ptr(["killed"]),
    },
    state: mut.killed === mut.total ? "verified" : "falsified",
    facts: [
      { k: "Mutants killed", n: num("v0.1/mutations.json", ["killed"], "int") },
      { k: "Mutants declared", n: num("v0.1/mutations.json", ["total"], "int") },
      { k: "Protocol", t: txt("v0.1/mutations.json", ["started_protocol"]) },
    ],
  });
  edge("MUT", "F", "VERIFIES", "v0.1/mutations.json", ["killed"]);
  mut.mutants.forEach((m, i) => {
    const ok = m.status === "KILLED" || m.status === "BASELINE_PASS";
    node({
      id: `MUT:${m.mutation}`,
      kind: "check",
      group: "mutation",
      label: {
        t: m.mutation.replace(/_/g, " "),
        src: "v0.1/mutations.json",
        ptr: ptr(["mutants", i, "mutation"]),
      },
      verdict: txt("v0.1/mutations.json", ["mutants", i, "status"]),
      state: ok ? "verified" : "falsified",
      facts: [
        { k: "Tests run", n: num("v0.1/mutations.json", ["mutants", i, "test_count"], "int") },
        { k: "Failures", n: num("v0.1/mutations.json", ["mutants", i, "failures"], "int") },
        { k: "Errors", n: num("v0.1/mutations.json", ["mutants", i, "errors"], "int") },
        { k: "File", t: txt("v0.1/mutations.json", ["mutants", i, "file"]) },
      ],
      hash: {
        v: m.source_edit_hash,
        src: "v0.1/mutations.json",
        ptr: ptr(["mutants", i, "source_edit_hash"]),
      },
    });
    edge(`MUT:${m.mutation}`, "MUT", "MUTANT", "v0.1/mutations.json", ["mutants", i]);
    timeline.push(
      ev("v0.1/mutations.json", ["generated_at"], `MUT:${m.mutation}`, "resolve", m.status),
    );
  });
  timeline.push(
    ev("v0.1/mutations.json", ["generated_at"], "MUT", "resolve", "Mutation run sealed"),
  );

  node({
    id: "REP",
    kind: "verifier",
    group: "repeat",
    label: { t: "repeatability", src: "v0.1/repeatability.json", ptr: ptr(["status"]) },
    verdict: txt("v0.1/repeatability.json", ["status"]),
    state:
      rep.status == null ? "unavailable" : rep.status === "IDENTICAL" ? "verified" : "falsified",
    facts: [
      { k: "Interpretation", t: txt("v0.1/repeatability.json", ["interpretation"]) },
      {
        k: "Holdout openings after repeat",
        n: num("v0.1/repeatability.json", ["holdout_openings_after_repeat"], "int"),
      },
    ],
  });
  edge("REP", "F", "VERIFIES", "v0.1/repeatability.json", ["status"]);
  timeline.push(
    ev(
      "v0.1/repeatability.json",
      ["generated_at"],
      "REP",
      "resolve",
      `Rerun ${String(rep.status).toLowerCase()}`,
    ),
  );

  node({
    id: "TESTS",
    kind: "verifier",
    group: "tests",
    label: { t: "test suite", src: "v0.1/final-tests.json", ptr: ptr(["total_passed"]) },
    verdict: {
      t: `focused run: ${suite.total_passed} passed · ${suite.failures} failures · ${suite.errors} errors`,
      src: "v0.1/tests.json",
      ptr: ptr(["failures"]),
      note: `and ${ptr(["errors"])}`,
    },
    state:
      typeof suite.failures !== "number" || typeof suite.errors !== "number"
        ? "unavailable"
        : suite.failures !== 0 || suite.errors !== 0
          ? "falsified"
          : /pending|do not claim green/i.test(String(suite.full_regression))
            ? "recorded"
            : "verified",
    facts: [
      { k: "Focused run passed (tests.json)", n: num("v0.1/tests.json", ["total_passed"], "int") },
      {
        k: "Later count (final-tests.json)",
        n: num("v0.1/final-tests.json", ["total_passed"], "int"),
      },
      { k: "Failures (focused run)", n: num("v0.1/tests.json", ["failures"], "int") },
      { k: "Errors (focused run)", n: num("v0.1/tests.json", ["errors"], "int") },
      { k: "Full regression", t: txt("v0.1/tests.json", ["full_regression"]) },
      {
        k: "Independent reference passed",
        n: num("v0.1/final-tests.json", ["independent_reference_passed"], "int"),
      },
      {
        k: "Reference module total",
        n: num("v0.1/final-tests.json", ["reference_module_total"], "int"),
      },
      { k: "Mutants killed", n: num("v0.1/final-tests.json", ["mutations_killed"], "int") },
      {
        k: "Calibration verification",
        t: txt("v0.1/final-tests.json", ["full_calibration_verification"]),
      },
    ],
  });
  edge("TESTS", "F", "VERIFIES", "v0.1/final-tests.json", ["total_passed"]);
  timeline.push(ev("v0.1/final-tests.json", ["generated_at"], "TESTS", "resolve", "Suite sealed"));

  // Skeptic: the v0.1.1 inference-calibration challenge -------------------------------------------
  node({
    id: "SK",
    kind: "skeptic",
    group: "skeptic",
    label: {
      t: "skeptic · inference audit v0.1.1",
      src: "v0.1.1/summary.json",
      ptr: ptr(["status"]),
    },
    verdict: txt("v0.1.1/summary.json", ["status"]),
    state: "challenge",
    model: txt("v0.1.1/summary.json", ["selected"]),
    world: {
      v: skFreeze.protocol_sha256,
      src: "v0.1.1/freeze-receipt.json",
      ptr: ptr(["protocol_sha256"]),
    },
    facts: [
      { k: "Settings passed", n: num("v0.1.1/summary.json", ["settings_passed"], "int") },
      { k: "Settings total", n: num("v0.1.1/summary.json", ["settings_total"], "int") },
      {
        k: "Confirmation null worlds",
        n: num("v0.1.1/summary.json", ["confirmation_null_worlds"], "int"),
      },
      {
        k: "Planted evaluations",
        n: num("v0.1.1/summary.json", ["confirmation_planted_evaluations"], "int"),
      },
      { k: "Discovery worlds", n: num("v0.1.1/summary.json", ["discovery_worlds"], "int") },
      { k: "Selected method", t: txt("v0.1.1/summary.json", ["selected"]) },
      { k: "Selection status", t: txt("v0.1.1/selection.json", ["selection", "status"]) },
      { k: "Old gate", t: txt("v0.1.1/summary.json", ["old_gate"]) },
      { k: "Engine authorized", t: txt("v0.1.1/summary.json", ["engine_authorized"]) },
      {
        k: "Market replication authorized",
        t: txt("v0.1.1/summary.json", ["market_replication_authorized"]),
      },
    ],
  });
  edge("SK", "F", "CHALLENGES", "v0.1.1/summary.json", ["old_gate"]);
  timeline.push(
    ev("v0.1.1/freeze-receipt.json", ["frozen_at"], "SK", "challenge", "Skeptic protocol frozen"),
  );
  timeline.push(
    ev("v0.1.1/discovery.json", ["completed_at"], "SK", "start", "Discovery worlds complete"),
  );
  timeline.push(ev("v0.1.1/selection.json", ["selected_at"], "SK", "start", "Method selected"));

  const logLines = String(rejectionLog).split(String.fromCharCode(10));
  const guardLine =
    logLines.findIndex((l) => /Selection does not match frozen discovery/.test(l)) + 1;
  const guardRejected = guardLine > 0,
    guardReproduced = conf.selection_hash === guard.old_selection_sha256;
  node({
    id: "SK:guard",
    kind: "check",
    group: "skeptic",
    label: {
      t: "selection guard",
      src: "v0.1.1/pre-confirmation-guard-repair.json",
      ptr: ptr(["reason"]),
    },
    verdict: {
      t: `${guardRejected ? "rejected" : "no rejection recorded"} · selection ${guardReproduced ? "reproduced" : "not reproduced"}`,
      src: "v0.1.1/pre-confirmation-rejection.log",
      ptr: `line ${guardLine}`,
      note: "selection hash in confirmation.json /selection_hash compared with guard repair /old_selection_sha256",
    },
    state: guardRejected ? (guardReproduced ? "repaired" : "falsified") : "unavailable",
    facts: [
      { k: "Reason", t: txt("v0.1.1/pre-confirmation-guard-repair.json", ["reason"]) },
      { k: "Scope", t: txt("v0.1.1/pre-confirmation-guard-repair.json", ["scope"]) },
      {
        k: "Worlds generated before repair",
        n: num(
          "v0.1.1/pre-confirmation-guard-repair.json",
          ["confirmation_worlds_generated"],
          "int",
        ),
      },
    ],
    hash: {
      v: guard.rejected_command_log_sha256,
      src: "v0.1.1/pre-confirmation-guard-repair.json",
      ptr: ptr(["rejected_command_log_sha256"]),
    },
  });
  edge("SK:guard", "SK", "GUARD", "v0.1.1/pre-confirmation-guard-repair.json", ["reason"]);
  timeline.push(
    ev(
      "v0.1.1/pre-confirmation-guard-repair.json",
      ["recorded_at"],
      "SK:guard",
      "reject",
      "Guard rejected selection",
    ),
  );

  const methods = conf.methods[summary.selected];
  for (const name of Object.keys(methods)) {
    const m = methods[name],
      M = ["methods", summary.selected, name],
      failed = summary.failed_settings[name] ?? [];
    node({
      id: `SK:${name}`,
      kind: "check",
      group: "skeptic",
      label: { t: name.replace(/_/g, " "), src: "v0.1.1/confirmation.json", ptr: ptr(M) },
      verdict: {
        t: m.accepted ? "ACCEPTED" : `FAILED · ${failed.join(", ")}`,
        src: m.accepted ? "v0.1.1/confirmation.json" : "v0.1.1/summary.json",
        ptr: m.accepted ? ptr([...M, "accepted"]) : ptr(["failed_settings", name]),
      },
      state: m.accepted ? "verified" : "falsified",
      facts: [
        {
          k: "One-sided null size",
          n: num("v0.1.1/confirmation.json", [...M, "greater_size"], "rate"),
        },
        {
          k: "Size 95% upper",
          n: num("v0.1.1/confirmation.json", [...M, "greater_size_upper"], "rate"),
        },
        { k: "Coverage", n: num("v0.1.1/confirmation.json", [...M, "coverage"], "rate") },
        {
          k: "Coverage 95% lower",
          n: num("v0.1.1/confirmation.json", [...M, "coverage_lower"], "rate"),
        },
        {
          k: "SD / reported SE",
          n: num("v0.1.1/confirmation.json", [...M, "empirical_sd_over_reported_se"], "x"),
        },
        { k: "Failed worlds", n: num("v0.1.1/confirmation.json", [...M, "failed_worlds"], "int") },
      ],
    });
    edge(`SK:${name}`, "SK", "SETTING", "v0.1.1/confirmation.json", M);
    timeline.push(
      ev(
        "v0.1.1/confirmation.json",
        ["completed_at"],
        `SK:${name}`,
        m.accepted ? "resolve" : "fail",
        m.accepted ? "Setting passed" : "Setting failed",
      ),
    );
  }
  timeline.push(
    ev("v0.1.1/confirmation.json", ["completed_at"], "SK", "resolve", "Confirmation complete"),
  );
  if (summary.old_gate === "PERMANENTLY_CLOSED")
    timeline.push({
      at: manifests["v0.1.1"].json.sealed_at,
      node: "F",
      kind: "challenged",
      label: `Old gate ${String(summary.old_gate).toLowerCase().replace(/_/g, " ")}`,
      src: "v0.1.1/manifest.json",
      ptr: ptr(["sealed_at"]),
    });

  // Stable order: by time, then by declaration order within the same instant.
  const seq = timeline.map((e, i) => [e, i]);
  seq.sort((a, b) => Date.parse(a[0].at) - Date.parse(b[0].at) || a[1] - b[1]);
  const ids = new Set(nodes.map((n) => n.id));
  for (const e of edges)
    if (!ids.has(e.from) || !ids.has(e.to))
      throw new Unavailable(`edge ${e.from}→${e.to} names an unknown node`);

  return {
    schema_version: SCHEMA,
    status: "AVAILABLE",
    reason: null,
    study: {
      title: txt("v0.1/preregistration.json", ["hypothesis", "name"]),
      alpha: alphaNum,
      z_crit: zCrit,
      z_crit2: zCrit2,
      settings_passed: num("v0.1.1/summary.json", ["settings_passed"], "int"),
      settings_total: num("v0.1.1/summary.json", ["settings_total"], "int"),
      holdout_openings: num("v0.1/flagship.json", ["holdout_openings"], "int"),
      series: txt("v0.1/flagship.json", ["series_label"]),
      preregistration_hash: {
        v: receipt.preregistration_hash,
        src: "v0.1/freeze-receipt.json",
        ptr: ptr(["preregistration_hash"]),
      },
      frozen_at: { v: receipt.frozen_at, src: "v0.1/freeze-receipt.json", ptr: ptr(["frozen_at"]) },
      code_commit: {
        v: receipt.code_commit,
        src: "v0.1/freeze-receipt.json",
        ptr: ptr(["code_commit"]),
      },
      evidence_cutoff: {
        v: pre.datasets[0].input_cutoff,
        src: "v0.1/preregistration.json",
        ptr: ptr(["datasets", 0, "input_cutoff"]),
      },
      evidence_mode: txt("v0.1/flagship.json", ["evidence_mode"]),
      licence: txt("v0.1/publication.json", ["licence_status"]),
      publication_scope: txt("v0.1/publication.json", ["scope"]),
      live: {
        t: null,
        reason:
          "No research run executes in this build; runs start in Q2/Q5. This is a replay of sealed v0.1 and v0.1.1 evidence.",
      },
    },
    sources: {
      ...sources,
      "v0.1/manifest.json": {
        path: `${ROOTS["v0.1"]}/manifest.json`,
        sha256: manifests["v0.1"].sha256,
        bytes: manifests["v0.1"].bytes.length,
        sealed_by: FREEZE,
        manifest_sha256: manifests.freeze.sha256,
      },
      [FREEZE]: {
        path: FREEZE,
        sha256: manifests.freeze.sha256,
        bytes: manifests.freeze.bytes,
        sealed_by: "repository freeze inventory (CI-checked)",
      },
      "v0.1.1/manifest.json": {
        path: `${ROOTS["v0.1.1"]}/manifest.json`,
        sha256: manifests["v0.1.1"].sha256,
        bytes: manifests["v0.1.1"].bytes.length,
        sealed_by: FREEZE,
        manifest_sha256: manifests.freeze.sha256,
      },
    },
    nodes,
    edges,
    timeline: seq.map(([e]) => e),
  };
}

function unavailable(reason) {
  return {
    schema_version: SCHEMA,
    status: "UNAVAILABLE",
    reason,
    study: null,
    sources: {},
    nodes: [],
    edges: [],
    timeline: [],
  };
}

let doc;
try {
  doc = build(loadSources());
} catch (error) {
  if (!(error instanceof Unavailable)) throw error;
  doc = unavailable(error.message);
  console.warn(`Research graph UNAVAILABLE: ${error.message}`);
}
const bytes = Buffer.from(JSON.stringify(doc) + "\n", "utf8");
const digest = sha256(bytes);
const name = `graph.${digest.slice(0, 16)}.json`;
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir))
  if (/^graph\.[0-9a-f]+\.json$/.test(f) && f !== name) unlinkSync(resolve(outDir, f));
writeFileSync(resolve(outDir, name), bytes);
mkdirSync(dirname(pinPath), { recursive: true });
writeFileSync(
  pinPath,
  `// Generated by scripts/generate-research-graph.mjs. Do not edit.\r\nexport const RESEARCH_GRAPH_PIN = {\r\n  url: "/research/${name}",\r\n  sha256: "${digest}",\r\n  bytes: ${bytes.length},\r\n} as const;\r\n`,
);
console.log(
  `Research graph ${doc.status}: ${doc.nodes.length} nodes, ${doc.edges.length} edges, ${doc.timeline.length} events → public/research/${name} (${bytes.length} bytes)`,
);
