import type { ReplayEntry } from "../../replay/contracts.ts";
import type { InvestigationContext, Market } from "./context.ts";

export type CapabilityLabel =
  | "PUBLIC_REPLAY"
  | "HOSTED_API_VERIFIED"
  | "HOSTED_AUTH_REQUIRED"
  | "LOCAL_LIVE_ONLY"
  | "UNAVAILABLE";
export type CapabilityFeature =
  | "market-overview"
  | "reference-navigation"
  | "regime-dashboard"
  | "factor-evidence"
  | "risk-evidence"
  | "data-diagnostics"
  | "recorded-agent-runs"
  | "recorded-world"
  | "frozen-research"
  | "recorded-trace"
  | "original-inspection"
  | "browser-watchlist"
  | "legacy-demo-latest"
  | "legacy-demo-history"
  | "legacy-demo-compare"
  | "local-live"
  | "market-options"
  | "market-fundamentals"
  | "market-private-risk"
  | "market-backtest"
  | "market-research"
  | "paper-book"
  | "fresh-quotes"
  | "model-training"
  | "agent-execution"
  | "factor-local-assessment"
  | "public-login"
  | "execution"
  | "hosted-health"
  | "hosted-auth-boundary"
  | "neural-trace";
export type AllowedActionClass =
  "navigate" | "read" | "playback" | "local-preference" | "local-computation" | "private-mutation";
export type Capability = {
  feature: CapabilityFeature;
  label: CapabilityLabel;
  enabled: boolean;
  readOnly: boolean;
  reason: string;
  disabledReason: string | null;
  allowedActionClass: AllowedActionClass;
  requiredMode: "replay" | "local-live" | "none";
  evidenceRef?: { artifactId: string; sha256: string; bytes: number };
  verificationBasis: {
    date: string;
    kind: "approved-source-review" | "observed-remote-boundary" | "checked-retained-binding";
    detail: string;
  };
};
export type CapabilityEnvironment = {
  hostname: string;
  localLiveFlag: boolean;
  mode: "replay" | "live";
};
export type CapabilityRequest = {
  feature: CapabilityFeature;
  context?: InvestigationContext;
  selectionAvailable?: boolean;
  binding?: ReplayEntry;
  artifactId?: string;
  hasDisplayProjection?: boolean;
  environment?: CapabilityEnvironment;
};
export const SCIENTIFIC_CLAIMS = Object.freeze({
  causal_claim_eligible: false,
  inference_certified: false,
  market_claim_eligible: false,
  precise_edge_confidence: false,
  trusted_graph: false,
  validated_alpha: false,
});
export function localEnvironmentAllowed(environment?: CapabilityEnvironment): boolean {
  return (
    !!environment &&
    ["localhost", "127.0.0.1", "[::1]"].includes(environment.hostname) &&
    environment.localLiveFlag === true
  );
}
export function publicDerivativeAvailable(entry: ReplayEntry | undefined): entry is ReplayEntry {
  return (
    !!entry &&
    entry.status === "AVAILABLE" &&
    typeof entry.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(entry.sha256) &&
    Number.isSafeInteger(entry.bytes) &&
    entry.bytes > 0 &&
    Number.isFinite(Date.parse(entry.as_of)) &&
    ["ACTIVE", "FIRST_PARTY", "PUBLIC_DOMAIN", "TEST_ONLY"].includes(entry.licence?.status) &&
    Array.isArray(entry.licence.permitted_uses) &&
    entry.licence.permitted_uses.includes("publish_derived") &&
    typeof entry.licence.dataset_key === "string" &&
    entry.licence.dataset_key.length > 0 &&
    (entry.licence.valid_through === null ||
      (Number.isFinite(Date.parse(entry.licence.valid_through)) &&
        Date.parse(entry.licence.valid_through) > Date.parse(entry.as_of)))
  );
}
/** Small metadata predicate mirrors the complete-original reader without importing its schemas. */
export function supportsOriginalInspection(
  id: string | undefined,
  entry: ReplayEntry | undefined,
): boolean {
  if (
    !id ||
    !publicDerivativeAvailable(entry) ||
    entry.bytes > 2 * 1024 * 1024 ||
    typeof entry.url !== "string"
  )
    return false;
  if (entry.kind.startsWith("data-organ-"))
    return (
      ["health", "coverage", "issues", "lineage", "revisions", "costs", "disagreement"].includes(
        entry.kind.slice(11),
      ) && id.startsWith("data-organ:")
    );
  if (entry.kind.startsWith("regimes-"))
    return (
      ["snapshot", "timeline", "factors", "lineage", "history", "matrix"].includes(
        entry.kind.slice(8),
      ) && id.startsWith("regimes:")
    );
  if (entry.kind.startsWith("factors-"))
    return (
      ["catalog", "audit", "ledger", "lineage"].includes(entry.kind.slice(8)) &&
      id.startsWith("factors:")
    );
  if (entry.kind === "market-series") return id === "market:US-MKT" || id === "market:IN-MKT";
  if (entry.kind === "risk-state" || entry.kind === "risk-sweep")
    return id.startsWith(entry.kind === "risk-state" ? "risk:state:" : "risk:sweep:");
  if (entry.kind === "hmm" || entry.kind === "signal")
    return new RegExp("^observatory:(US-MKT|IN-MKT):" + entry.kind + "$").test(id);
  return (
    ["forge:runs", "forge:artifacts", "forge:worlds", "forge:baselines"].includes(id) ||
    /^forge:(run|baseline|reality):[a-f0-9]{64}$/.test(id)
  );
}

const LOCAL = new Set<CapabilityFeature>([
  "local-live",
  "market-options",
  "market-fundamentals",
  "market-private-risk",
  "market-backtest",
  "market-research",
  "paper-book",
  "fresh-quotes",
  "model-training",
  "agent-execution",
]);
const UNAVAILABLE = new Set<CapabilityFeature>([
  "legacy-demo-history",
  "legacy-demo-compare",
  "factor-local-assessment",
  "public-login",
  "execution",
  "neural-trace",
]);
/** Feature/selection labels describe evidence; they never invoke an API or elevate mode. */
export function capabilityFor(request: CapabilityRequest): Capability {
  const { feature, context, binding } = request;
  const publicFeatures = [
    "market-overview",
    "reference-navigation",
    "regime-dashboard",
    "factor-evidence",
    "risk-evidence",
    "data-diagnostics",
    "recorded-agent-runs",
    "recorded-world",
    "frozen-research",
    "recorded-trace",
    "original-inspection",
    "browser-watchlist",
    "legacy-demo-latest",
    "hosted-health",
    "hosted-auth-boundary",
  ];
  if (!publicFeatures.includes(feature) && !LOCAL.has(feature) && !UNAVAILABLE.has(feature))
    throw new Error("Unknown capability feature.");
  const artifactId = request.artifactId ?? context?.anchor?.artifactId;
  const result = (
    label: CapabilityLabel,
    enabled: boolean,
    reason: string,
    readOnly = true,
  ): Capability => {
    const allowedActionClass: AllowedActionClass =
      feature === "recorded-trace"
        ? "playback"
        : feature === "browser-watchlist"
          ? "local-preference"
          : ["paper-book", "execution"].includes(feature)
            ? "private-mutation"
            : [
                  "model-training",
                  "agent-execution",
                  "market-options",
                  "market-backtest",
                  "market-private-risk",
                ].includes(feature)
              ? "local-computation"
              : ["reference-navigation", "local-live"].includes(feature)
                ? "navigate"
                : "read";
    const remote = feature === "hosted-health" || feature === "hosted-auth-boundary";
    return {
      feature,
      label,
      enabled,
      readOnly,
      reason,
      disabledReason: enabled ? null : reason,
      allowedActionClass,
      requiredMode: LOCAL.has(feature)
        ? "local-live"
        : remote || feature === "reference-navigation" || feature === "browser-watchlist"
          ? "none"
          : "replay",
      ...(artifactId && publicDerivativeAvailable(binding)
        ? { evidenceRef: { artifactId, sha256: binding.sha256!, bytes: binding.bytes } }
        : {}),
      verificationBasis: {
        date: "2026-10-27",
        kind: remote
          ? "observed-remote-boundary"
          : binding
            ? "checked-retained-binding"
            : "approved-source-review",
        detail: remote
          ? "Dated approved-plan production probe; only the named GET/boundary was observed."
          : binding
            ? "Exact compiled public metadata binding; this capability resolver does not fetch or verify the complete original."
            : "Approved Phase 7.5 plan sections10/24/27 and current guarded source behavior; no runtime probe or mode elevation.",
      },
    };
  };
  if (feature === "hosted-health")
    return result(
      "HOSTED_API_VERIFIED",
      true,
      "Only GET /api/health was verified (200, FinSight Alpha API 0.1.0); business operations and backend revision were not verified.",
    );
  if (feature === "hosted-auth-boundary")
    return result(
      "HOSTED_AUTH_REQUIRED",
      false,
      "Observed 401 authentication boundary only; authenticated route behavior, account access and provider readiness are unverified.",
    );
  if (LOCAL.has(feature)) {
    const allowed =
      localEnvironmentAllowed(request.environment) && request.environment?.mode === "live";
    const scientific = ["model-training", "agent-execution", "fresh-quotes"].includes(feature);
    return result(
      "LOCAL_LIVE_ONLY",
      allowed && !scientific,
      scientific
        ? "Existing local configuration and entitlements are required. This investigation service offers no collection, training or execution action."
        : "Requires loopback, the explicit Local Live build flag and the existing guarded local mode/session; hosted operation is unverified.",
      false,
    );
  }
  if (UNAVAILABLE.has(feature))
    return result(
      "UNAVAILABLE",
      false,
      feature === "execution"
        ? "Execution and trading are future work; this route is an explanation only."
        : feature.startsWith("legacy-demo-")
          ? "Only the two admitted synthetic latest snapshots exist; historical/compare query variants have no admitted Replay route."
          : feature === "factor-local-assessment"
            ? "No installed tenant-local assessment exists; Live mode alone cannot enable it."
            : feature === "public-login"
              ? "The account form is local only; public hosted login is unavailable."
              : "No admitted neural recording exists.",
    );
  if (request.selectionAvailable === false)
    return result(
      "UNAVAILABLE",
      false,
      "No exact admitted public evidence exists for this selection; no replacement was chosen.",
    );
  if (feature === "original-inspection")
    return supportsOriginalInspection(artifactId, binding)
      ? result(
          "PUBLIC_REPLAY",
          true,
          "Explicit complete-original inspection verifies its exact SHA/bytes and full payload.",
        )
      : result(
          "UNAVAILABLE",
          false,
          "Complete-original inspection is unavailable or exceeds the 2 MiB browser read limit. A display window does not verify the unfetched complete original.",
        );
  if (feature === "recorded-trace") {
    const subject = context?.subject;
    const scene = context?.view.workspace === "observatory" ? context.view.scene : undefined;
    const aggregate = subject?.kind === "market-factor";
    const expectedId =
      aggregate && (scene === "hmm" || scene === "signal")
        ? `observatory:${subject.id}:${scene}`
        : undefined;
    const expectedSource =
      aggregate && subject.id === "IN-MKT" ? "iima:daily-factors" : "ken-french:daily-factors";
    const supported =
      !!context &&
      aggregate &&
      (scene === "hmm" || scene === "signal") &&
      context?.anchor?.artifactId === expectedId &&
      context.view.workspace === "observatory" &&
      (!context.view.traceId || context.view.traceId === expectedId) &&
      request.selectionAvailable === true &&
      publicDerivativeAvailable(binding) &&
      binding.kind === scene &&
      binding.sources.length === 1 &&
      binding.sources[0] === (subject.id === "IN-MKT" ? "IIMA" : "KENNETH_FRENCH") &&
      binding.licence.dataset_key === expectedSource &&
      (!context.market || context.market === (subject.id === "IN-MKT" ? "INDIA" : "US")) &&
      (!context.view.cutoff || context.view.cutoff === binding.as_of) &&
      (!request.artifactId || request.artifactId === expectedId);
    if (
      !supported ||
      (binding!.bytes > 2 * 1024 * 1024 &&
        !(
          request.hasDisplayProjection &&
          binding!.kind === "hmm" &&
          subject?.kind === "market-factor" &&
          subject.id === "IN-MKT"
        ))
    )
      return result(
        "UNAVAILABLE",
        false,
        "Only exact AVAILABLE US-MKT/IN-MKT HMM/signal recordings have public playback; security/neural traces and unsupported large originals remain unavailable.",
      );
    return result(
      "PUBLIC_REPLAY",
      true,
      binding!.bytes > 2 * 1024 * 1024
        ? "Build-verified India HMM display window: 8 retained frames [92,100) / 60 dates. Complete-original inspection exceeds 2 MiB and stays disabled."
        : "Recorded aggregate trace, read-only; optimization iterations are separate from observation dates and no calibrated forecast is implied.",
    );
  }
  if (feature === "market-overview" && context?.subject?.kind !== "market-factor")
    return result(
      "UNAVAILABLE",
      false,
      "A reference listing establishes identity only; public quote and security-level diagnostic coverage is not implied.",
    );
  if (feature === "reference-navigation" || feature === "browser-watchlist")
    return result(
      "PUBLIC_REPLAY",
      true,
      "Reference identity / browser-local navigation shortcut only; no quote coverage, PIT universe, security screen or portfolio is implied.",
    );
  if (feature === "frozen-research")
    return result(
      "PUBLIC_REPLAY",
      true,
      "Already-published frozen summary only: Research OS CLOSED / NOT_CALIBRATED; no per-experiment directory or research execution.",
    );
  if (feature === "legacy-demo-latest")
    return result(
      "PUBLIC_REPLAY",
      true,
      "SYNTHETIC: exact admitted demo-full/demo-sparse latest snapshots only.",
    );
  return result(
    "PUBLIC_REPLAY",
    true,
    "Read-only admitted historical derived evidence; availability is per selected component and is not live coverage or scientific eligibility.",
  );
}
export type Phase5Component = {
  id: string;
  label: string;
  status: Readonly<Record<Market, "AVAILABLE" | "PARTIAL" | "UNAVAILABLE">>;
  limitation: string;
};
export const PHASE5_COMPONENTS: readonly Phase5Component[] = [
  {
    id: "volatility",
    label: "Volatility clustering",
    status: { US: "AVAILABLE", INDIA: "PARTIAL" },
    limitation:
      "Historical diagnostic; India retains observation/calendar limits, not fresh instrument monitoring.",
  },
  {
    id: "seasonality",
    label: "Intraday seasonality",
    status: { US: "UNAVAILABLE", INDIA: "UNAVAILABLE" },
    limitation:
      "No public seasonality evidence; conditional US local IEX only, India also lacks an admitted calendar.",
  },
  {
    id: "neutrality",
    label: "Factor neutrality",
    status: { US: "PARTIAL", INDIA: "PARTIAL" },
    limitation:
      "MOM on MKT/SMB/HML only; seven-factor/universal neutrality unavailable; asymptotic diagnostics, not calibrated.",
  },
  {
    id: "momentum",
    label: "Regime momentum",
    status: { US: "PARTIAL", INDIA: "PARTIAL" },
    limitation:
      "Descriptive retained MOM / lagged state only; no validated alpha. Frozen Research conclusions remain separate.",
  },
  {
    id: "fracture",
    label: "MacroHFT fracture",
    status: { US: "PARTIAL", INDIA: "PARTIAL" },
    limitation: "Volatility-only 1/6 contribution; full composite score and landscape unavailable.",
  },
  {
    id: "hawkes",
    label: "Hawkes / Hawkes to HMM",
    status: { US: "UNAVAILABLE", INDIA: "UNAVAILABLE" },
    limitation:
      "Synthetic work is retained separately; real event pressure and Hawkes-driven HMM remain unavailable/unvalidated.",
  },
];
