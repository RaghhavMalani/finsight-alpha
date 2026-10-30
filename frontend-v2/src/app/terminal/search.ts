import { resolveInstrument } from "../../markets/instruments.ts";
import type { ReplayEntry } from "../../replay/contracts.ts";
import { WORKSPACES } from "../workspaces.ts";
import {
  catalogEntities,
  loadSearchNavigation,
  loadRetainedSearchNavigation,
  type NavigationRecord,
  loadTerminalShard,
  stableTerminal,
  type TerminalEntity,
  type TerminalShard,
  type TerminalShardName,
} from "./catalog.ts";
import type { Capability, CapabilityFeature, capabilityFor } from "./capabilities.ts";
import {
  serializeInvestigationContext,
  type InvestigationContext,
  type InvestigationView,
  type TerminalWorkspace,
} from "./context.ts";
import { buildInvestigationTarget, type InvestigationTarget } from "./links.ts";

export type SearchCatalog = {
  capabilityResolver?: typeof capabilityFor;
  navigation?: readonly NavigationRecord[];
  entities: readonly TerminalEntity[];
  bindings: Readonly<Record<string, ReplayEntry>>;
  routes?: Readonly<Record<string, string>>;
  projectionPins?: Readonly<Record<string, string>>;
};
export type SearchScope = "current" | "history";
export type SearchChoice = {
  key: string;
  market?: "US" | "INDIA";
  artifactId: string | null;
  cutoff: string | null;
  view: InvestigationView;
  target?: InvestigationTarget;
};
export type SearchResult = {
  key: string;
  id: string;
  type: string;
  namespace: string;
  label: string;
  kind: "navigation" | "reference" | "evidence" | "command";
  market?: "US" | "INDIA";
  artifactId: string | null;
  cutoff: string | null;
  availability: "AVAILABLE" | "REFERENCE" | "DISABLED";
  capability: Capability;
  rank: number;
  target?: InvestigationTarget;
  requiresChoice: boolean;
  choices: SearchChoice[];
};
export type SearchResponse = {
  query: string;
  scope: SearchScope;
  results: SearchResult[];
  total: number;
  limited: boolean;
  materializedTargets: number;
};
export type LoadedSearchOptions = SearchCatalog & {
  scope?: SearchScope;
  limit?: number;
  types?: readonly string[];
};
export type TerminalSearchOptions = {
  workspaces?: readonly TerminalWorkspace[];
  history?: boolean;
  limit?: number;
  types?: readonly string[];
  signal?: AbortSignal;
};
const TYPES = new Set([
  "workspace",
  "reference-listing",
  "market-factor",
  "artifact",
  "data-origin",
  "signal",
  "admission",
  "source-version",
  "capture",
  "capture-sha",
  "data-source",
  "model-run",
  "factor",
  "factor-definition",
  "factor-audit-channel",
  "issue",
  "sweep",
  "recorded-trace",
  "recorded-agent-run",
  "recorded-task",
  "source",
  "source-admission",
  "frozen-research",
]);
const SHARDS: Readonly<Record<TerminalWorkspace, TerminalShardName>> = {
  market: "market",
  world: "recordings",
  risk: "risk",
  regimes: "regimes",
  factors: "factors",
  research: "regimes",
  execution: "seed",
  observatory: "recordings",
  agents: "recordings",
  data: "data",
};
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
function queryText(query: string): string {
  if (
    typeof query !== "string" ||
    query.length > 160 ||
    [...query].some(
      (c) =>
        c.codePointAt(0)! < 32 ||
        c.codePointAt(0) === 127 ||
        c.codePointAt(0) === 65533 ||
        (c.codePointAt(0)! >= 0xd800 && c.codePointAt(0)! <= 0xdfff),
    )
  )
    throw new Error("Search text must be valid public text of at most 160 characters.");
  return query.trim().toLowerCase();
}
function publicDerivativeAvailable(entry: ReplayEntry | undefined): entry is ReplayEntry {
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

/** Navigation presentation only; business/runtime actions retain the full capability resolver. */
export function navigationCapability(
  state: "PUBLIC_REPLAY" | "LOCAL_LIVE_ONLY" | "UNAVAILABLE",
  entity: Pick<TerminalEntity, "type" | "workspace">,
): Capability {
  if (!["PUBLIC_REPLAY", "LOCAL_LIVE_ONLY", "UNAVAILABLE"].includes(state))
    throw new Error("Unknown navigation availability.");
  const reason = {
    PUBLIC_REPLAY: "Verified retained Replay destination.",
    LOCAL_LIVE_ONLY: "Available only in configured Local Live.",
    UNAVAILABLE: "No admitted destination for this selection.",
  }[state];
  if (!reason) throw new Error("Unknown navigation availability.");
  return {
    feature: entity.workspace === "execution" ? "execution" : feature(entity),
    label: state,
    enabled: state === "PUBLIC_REPLAY",
    readOnly: true,
    reason,
    disabledReason: state === "PUBLIC_REPLAY" ? null : reason,
    allowedActionClass: "navigate",
    requiredMode:
      state === "LOCAL_LIVE_ONLY"
        ? "local-live"
        : entity.type === "workspace" || entity.type === "reference-listing"
          ? "none"
          : "replay",
    verificationBasis: {
      date: "2026-10-31",
      kind: "approved-source-review",
      detail:
        "BUILD-VERIFIED NAVIGATION METADATA; original evidence is checked only on explicit inspection.",
    },
  };
}

function feature(entity: Pick<TerminalEntity, "type" | "workspace">): CapabilityFeature {
  if (["workspace", "reference-listing"].includes(entity.type)) return "reference-navigation";
  if (entity.type === "recorded-trace") return "recorded-trace";
  return (
    {
      market: "market-overview",
      world: "recorded-world",
      risk: "risk-evidence",
      regimes: "regime-dashboard",
      factors: "factor-evidence",
      research: "frozen-research",
      execution: "execution",
      observatory: "recorded-trace",
      agents: "recorded-agent-runs",
      data: "data-diagnostics",
    } as const
  )[entity.workspace];
}
/** An explicit metadata selection adopts its declared identity, never a guessed cross-entity relation. */
export function entityTarget(
  entity: TerminalEntity,
  context: InvestigationContext,
  choice?: Pick<SearchChoice, "artifactId" | "view">,
): InvestigationTarget {
  if (entity.type === "workspace") return buildInvestigationTarget(context, entity.workspace);
  let subject: InvestigationContext["subject"];
  if (entity.type === "reference-listing") {
    const listing = resolveInstrument(entity.id, entity.namespace);
    subject = {
      kind: "reference-listing",
      providerSymbol: listing.providerSymbol,
      venue: listing.code,
    };
  } else if (entity.market)
    subject = { kind: "market-factor", id: entity.market === "INDIA" ? "IN-MKT" : "US-MKT" };
  const artifactId = choice?.artifactId ?? entity.artifactId;
  return buildInvestigationTarget(
    {
      version: 1,
      ...(entity.market ? { market: entity.market } : {}),
      ...(subject ? { subject } : {}),
      ...(artifactId ? { anchor: { artifactId } } : {}),
      ...(context.origin ? { origin: context.origin } : {}),
      view: choice?.view ?? entity.view,
    },
    entity.workspace,
    choice?.view ?? entity.view,
  );
}
type TargetMemo = { contextWire: string; targets: Map<string, InvestigationTarget> };
const targetMemos = new WeakMap<InvestigationContext, TargetMemo>();
function freezeTarget<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeTarget(child);
    Object.freeze(value);
  }
  return value;
}
/** Reuse immutable navigation construction only; availability and capability are checked on every search. */
function searchTarget(
  entity: TerminalEntity,
  context: InvestigationContext,
  choice: SearchChoice,
  contextWire: string,
): InvestigationTarget {
  let memo = targetMemos.get(context);
  if (!memo || memo.contextWire !== contextWire) {
    memo = { contextWire, targets: new Map() };
    targetMemos.set(context, memo);
  }
  const key = stableTerminal([
    entity.type,
    entity.namespace,
    entity.id,
    entity.workspace,
    entity.market ?? null,
    choice.artifactId,
    choice.view,
  ]);
  const prior = memo.targets.get(key);
  if (prior) return prior;
  const target = freezeTarget(entityTarget(entity, context, choice));
  if (memo.targets.size >= 512) memo.targets.delete(memo.targets.keys().next().value!);
  memo.targets.set(key, target);
  return target;
}
function rank(
  entity: Pick<TerminalEntity, "id" | "label" | "type" | "key" | "namespace">,
  query: string,
): number {
  if (!query) return 4;
  const id = entity.id.toLowerCase(),
    label = entity.label.toLowerCase();
  if (query === id && !["workspace", "reference-listing", "market-factor"].includes(entity.type))
    return 0;
  const mnemonic =
    entity.type === "workspace"
      ? WORKSPACES.find((w) => w.id === entity.id)?.command.toLowerCase()
      : undefined;
  if (
    query === id ||
    query === mnemonic ||
    query === entity.key.toLowerCase() ||
    query === `${entity.namespace}:${entity.id}`.toLowerCase()
  )
    return entity.type === "workspace" ||
      entity.type === "reference-listing" ||
      entity.type === "market-factor"
      ? 1
      : 0;
  if (label.startsWith(query)) return 2;
  const tokens = `${id} ${label} ${entity.namespace}`.split(/[\s:|/._-]+/);
  if (tokens.some((token) => token.startsWith(query))) return 3;
  return `${id} ${label} ${entity.namespace}`.includes(query) ? 4 : Infinity;
}
function currentAnchors(routes: SearchCatalog["routes"]): Set<string> {
  return new Set(
    Object.entries(routes ?? {})
      .filter(([route]) => {
        const url = new URL(route, "https://terminal.invalid");
        return (
          !["at", "as_of", "cutoff", "sweep_id", "state_id"].some((key) =>
            url.searchParams.has(key),
          ) && !/\/(?:history|sweeps|states)\//.test(url.pathname)
        );
      })
      .map(([, id]) => id),
  );
}
/** These two admitted fixed market IDs have no manifest route aliases or historical revisions. */
function currentMarketFactor(
  entity: TerminalEntity,
  choice: Pick<SearchChoice, "artifactId" | "cutoff" | "view">,
  binding: ReplayEntry | undefined,
): boolean {
  const india = entity.id === "IN-MKT";
  return (
    (india || entity.id === "US-MKT") &&
    entity.type === "market-factor" &&
    entity.namespace === "market-factor" &&
    entity.workspace === "market" &&
    entity.market === (india ? "INDIA" : "US") &&
    entity.artifactId === `market:${entity.id}` &&
    choice.artifactId === entity.artifactId &&
    choice.view.workspace === "market" &&
    choice.cutoff === entity.cutoff &&
    publicDerivativeAvailable(binding) &&
    binding.kind === "market-series" &&
    binding.scope === "FACTOR_RESEARCH" &&
    binding.as_of === choice.cutoff &&
    binding.url === `/artifacts/replay/market-${entity.id}.json` &&
    binding.sources.length === 1 &&
    binding.sources[0] === (india ? "IIMA" : "KENNETH_FRENCH") &&
    binding.licence.dataset_key === (india ? "iima:daily-factors" : "ken-french:daily-factors")
  );
}
/** Synchronous search over already validated bounded metadata; no network or fuzzy inference. */
export function searchLoaded(
  query: string,
  context: InvestigationContext,
  options: LoadedSearchOptions,
): SearchResponse {
  if (options.navigation) return searchNavigation(query, context, options.navigation, options);
  const contextWire = stableTerminal(serializeInvestigationContext(context));
  const normalized = queryText(query),
    scope = options.scope ?? "current",
    limit = options.limit ?? 20;
  if (
    !["current", "history"].includes(scope) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    options.entities.length > 4096
  )
    throw new Error("Search scope/capacity exceeds its reviewed bound.");
  const available = new Map<string, boolean>();
  const admitted = (id: string) => {
    if (!available.has(id)) available.set(id, publicDerivativeAvailable(options.bindings[id]));
    return available.get(id) === true;
  };
  const groups = new Map<string, { values: TerminalEntity[]; score: number }>(),
    current = scope === "current" ? currentAnchors(options.routes) : new Set<string>();
  for (const entity of options.entities) {
    if (
      entity.availability !== "AVAILABLE" ||
      !TYPES.has(entity.type) ||
      ![
        entity.artifactId ?? "static-reference",
        ...(entity.versionChoices?.length ? ["semantic"] : []),
      ].some((tail) => entity.key === [entity.type, entity.namespace, entity.id, tail].join("|"))
    )
      continue;
    if (!normalized && !["workspace", "reference-listing", "market-factor"].includes(entity.type))
      continue;
    if (options.types && !options.types.includes(entity.type)) continue;
    const score = rank(entity, normalized);
    if (!Number.isFinite(score)) continue;
    if (
      entity.artifactId
        ? !admitted(entity.artifactId)
        : !["workspace", "reference-listing"].includes(entity.type)
    )
      continue;
    const key = [entity.type, entity.namespace, entity.id, entity.market ?? "ALL"].join("|"),
      group = groups.get(key);
    if (group) {
      group.values.push(entity);
      group.score = Math.min(group.score, score);
    } else groups.set(key, { values: [entity], score });
  }
  const results: SearchResult[] = [];
  let total = 0;
  const ordered = [...groups]
    .map(([key, group]) => ({ key, ...group }))
    .sort(
      (a, b) =>
        a.score - b.score ||
        compare(a.values[0].type, b.values[0].type) ||
        compare(a.values[0].id, b.values[0].id) ||
        compare(a.values[0].namespace, b.values[0].namespace) ||
        compare(a.key, b.key),
    );
  for (const { key, values, score } of ordered) {
    values.sort((a, b) => compare(b.cutoff ?? "", a.cutoff ?? "") || compare(a.key, b.key));
    const entity = values[0],
      versions = new Map<string, SearchChoice>();
    for (const value of values) {
      const choices = [
        { artifactId: value.artifactId, cutoff: value.cutoff, view: value.view },
        ...(scope === "history"
          ? (value.versionChoices ?? [])
          : (value.versionChoices ?? []).filter(
              (v) => v.artifactId === context.anchor?.artifactId,
            )),
      ];
      for (const choice of choices) {
        if (choice.artifactId && !admitted(choice.artifactId)) continue;
        if (
          scope === "current" &&
          current.size &&
          choice.artifactId &&
          !current.has(choice.artifactId) &&
          !currentMarketFactor(value, choice, options.bindings[choice.artifactId]) &&
          context.anchor?.artifactId !== choice.artifactId &&
          !["recorded-trace", "recorded-agent-run", "recorded-task"].includes(entity.type)
        )
          continue;
        const choiceKey = choice.artifactId ?? "static-reference";
        const next = {
          key: key + "|" + choiceKey,
          ...(value.market ? { market: value.market } : {}),
          ...choice,
        };
        const prior = versions.get(choiceKey);
        if (prior && stableTerminal(prior) !== stableTerminal(next))
          throw new Error("Search version has conflicting exact selection metadata.");
        versions.set(choiceKey, next);
      }
    }
    const choices = [...versions.values()].sort(
      (a, b) => compare(b.cutoff ?? "", a.cutoff ?? "") || compare(a.key, b.key),
    );
    if (!choices.length) continue;
    total++;
    if (results.length >= limit) continue;
    for (const choice of choices)
      choice.target = searchTarget(entity, context, choice, contextWire);
    const selected =
      choices.find((choice) => choice.artifactId === context.anchor?.artifactId) ?? choices[0];
    const target = selected.target!,
      binding = selected.artifactId ? options.bindings[selected.artifactId] : undefined;
    const capability = options.capabilityResolver
      ? options.capabilityResolver({
          feature: feature(entity),
          context: target.context,
          binding,
          selectionAvailable: true,
          hasDisplayProjection:
            !!options.projectionPins?.[`${selected.artifactId}|observatory-trace-window`],
        })
      : navigationCapability(
          ["workspace", "reference-listing", "market-factor"].includes(entity.type) &&
            entity.workspace !== "execution"
            ? "PUBLIC_REPLAY"
            : "UNAVAILABLE",
          entity,
        );
    const requiresChoice =
      choices.length > 1 &&
      !choices.some((choice) => choice.artifactId === context.anchor?.artifactId);
    if (!capability.enabled) for (const choice of choices) delete choice.target;
    results.push({
      key,
      id: entity.id,
      type: entity.type,
      namespace: entity.namespace,
      label: entity.label,
      kind:
        entity.type === "workspace"
          ? "navigation"
          : entity.type === "reference-listing"
            ? "reference"
            : "evidence",
      ...(entity.market ? { market: entity.market } : {}),
      artifactId: selected.artifactId,
      cutoff: selected.cutoff,
      availability: !capability.enabled
        ? "DISABLED"
        : entity.type === "reference-listing"
          ? "REFERENCE"
          : "AVAILABLE",
      capability,
      rank: score,
      ...(capability.enabled && !requiresChoice ? { target } : {}),
      requiresChoice,
      choices,
    });
  }
  const execution = WORKSPACES.find((workspace) => workspace.id === "execution")!;
  if (
    (!options.types || options.types.includes("workspace")) &&
    (!normalized || ["exec", "execution"].some((word) => word.includes(normalized)))
  ) {
    total++;
    results.push({
      key: "workspace|terminal|execution",
      id: execution.id,
      type: "workspace",
      namespace: "terminal",
      label: "EXECUTION · unavailable / future explanation",
      kind: "command",
      artifactId: null,
      cutoff: null,
      availability: "DISABLED",
      capability: options.capabilityResolver
        ? options.capabilityResolver({ feature: "execution" })
        : navigationCapability("UNAVAILABLE", { type: "workspace", workspace: "execution" }),
      rank: normalized === "exec" || normalized === "execution" ? 1 : 4,
      requiresChoice: false,
      choices: [],
    });
  }
  results.sort(
    (a, b) =>
      a.rank - b.rank ||
      compare(a.type, b.type) ||
      compare(a.id, b.id) ||
      compare(a.namespace, b.namespace) ||
      compare(a.key, b.key),
  );
  return {
    query: normalized,
    scope,
    results: results.slice(0, limit),
    total,
    limited: total > limit,
    materializedTargets: results.reduce(
      (n, result) => n + result.choices.filter((choice) => choice.target).length,
      0,
    ),
  };
}

/** Build-only semantic oracle over the complete already-validated source catalog. */
export function deriveNavigationRecords(
  options: SearchCatalog,
  scope: SearchScope = "current",
  capabilityResolver?: typeof capabilityFor,
): NavigationRecord[] {
  if (!capabilityResolver)
    throw new Error("Build/history derivation requires complete source capability authority.");
  const context: InvestigationContext = { version: 1, view: { workspace: "risk" } },
    found = new Map<string, NavigationRecord>();
  for (const entity of options.entities) {
    const result = searchLoaded(entity.id, context, {
      ...options,
      navigation: undefined,
      capabilityResolver,
      scope,
      limit: 50,
    }).results.find(
      (result) =>
        result.type === entity.type &&
        result.namespace === entity.namespace &&
        result.id === entity.id &&
        result.market === entity.market,
    );
    if (!result || found.has(result.key)) continue;
    const choices = result.choices.map(({ artifactId, cutoff, view }) => ({
      artifactId,
      cutoff,
      view,
      availability: result.capability.label as "PUBLIC_REPLAY" | "LOCAL_LIVE_ONLY" | "UNAVAILABLE",
    }));
    if (!choices.length) continue;
    found.set(result.key, {
      key: result.key,
      id: result.id,
      type: result.type,
      namespace: result.namespace,
      label: result.label,
      workspace: choices[0].view.workspace,
      ...(result.market ? { market: result.market } : {}),
      choices,
    });
  }
  return [...found.values()].sort((a, b) => compare(a.key, b.key));
}
const normalizedRecords = new WeakMap<
  readonly NavigationRecord[],
  ReadonlyMap<string, { id: string; label: string; text: string; tokens: string[]; key: string }>
>();
function navigationStrings(records: readonly NavigationRecord[]) {
  let cached = normalizedRecords.get(records);
  if (!cached) {
    cached = new Map(
      records.map((record) => {
        const id = record.id.toLowerCase(),
          label = record.label.toLowerCase(),
          text = id + " " + label + " " + record.namespace.toLowerCase();
        return [
          record.key,
          { id, label, text, tokens: text.split(/[\s:|/._-]+/), key: record.key.toLowerCase() },
        ];
      }),
    );
    normalizedRecords.set(records, cached);
  }
  return cached;
}
/** Rank compact records first. Only the selected top limit can materialize typed targets/capabilities. */
function searchNavigation(
  query: string,
  context: InvestigationContext,
  records: readonly NavigationRecord[],
  options: LoadedSearchOptions,
): SearchResponse {
  serializeInvestigationContext(context);
  const normalized = queryText(query),
    scope = options.scope ?? "current",
    limit = options.limit ?? 20;
  if (
    !["current", "history"].includes(scope) ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    records.length > 4096
  )
    throw new Error("Search scope/capacity exceeds its reviewed bound.");
  const texts = navigationStrings(records);
  const candidates = records.flatMap((record) => {
    if (
      (!normalized && !["workspace", "reference-listing", "market-factor"].includes(record.type)) ||
      (options.types && !options.types.includes(record.type))
    )
      return [];
    const text = texts.get(record.key)!;
    const navigation = ["workspace", "reference-listing", "market-factor"].includes(record.type),
      mnemonic =
        record.type === "workspace"
          ? WORKSPACES.find((w) => w.id === record.id)?.command.toLowerCase()
          : undefined;
    const score = !normalized
      ? 4
      : normalized === text.id ||
          normalized === text.key ||
          normalized === mnemonic ||
          normalized === (record.namespace + ":" + record.id).toLowerCase()
        ? navigation
          ? 1
          : 0
        : text.label.startsWith(normalized)
          ? 2
          : text.tokens.some((token) => token.startsWith(normalized))
            ? 3
            : text.text.includes(normalized)
              ? 4
              : Infinity;
    return Number.isFinite(score) ? [{ record, score }] : [];
  });
  const execution = WORKSPACES.find((workspace) => workspace.id === "execution")!;
  const executionIncluded =
    (!options.types || options.types.includes("workspace")) &&
    (!normalized || ["exec", "execution"].some((word) => word.includes(normalized)));
  if (executionIncluded)
    candidates.push({
      record: {
        key: "workspace|terminal|execution|ALL",
        id: execution.id,
        type: "workspace",
        namespace: "terminal",
        label: "EXECUTION · unavailable / future explanation",
        workspace: "execution",
        choices: [
          {
            artifactId: null,
            cutoff: null,
            view: { workspace: "execution" },
            availability: "UNAVAILABLE",
          },
        ],
      },
      score: normalized === "exec" || normalized === "execution" ? 1 : 4,
    });
  candidates.sort(
    (a, b) =>
      a.score - b.score ||
      compare(a.record.type, b.record.type) ||
      compare(a.record.id, b.record.id) ||
      compare(a.record.namespace, b.record.namespace) ||
      compare(a.record.key, b.record.key),
  );
  let materializedTargets = 0;
  const results = candidates.slice(0, limit).map(({ record, score }): SearchResult => {
    const choices = record.choices.map((choice): SearchChoice => ({
      key: record.key + "|" + (choice.artifactId ?? "static-reference"),
      ...(record.market ? { market: record.market } : {}),
      artifactId: choice.artifactId,
      cutoff: choice.cutoff,
      view: choice.view,
    }));
    const selectedIndex = Math.max(
        0,
        choices.findIndex((choice) => choice.artifactId === context.anchor?.artifactId),
      ),
      selected = choices[selectedIndex],
      state = record.choices[selectedIndex].availability;
    const entity: TerminalEntity = {
      ...record,
      key: [
        record.type,
        record.namespace,
        record.id,
        selected.artifactId ?? "static-reference",
      ].join("|"),
      artifactId: selected.artifactId,
      cutoff: selected.cutoff,
      view: selected.view,
      availability: "AVAILABLE",
    };
    const target = entityTarget(entity, context, selected);
    materializedTargets++;
    const capability = navigationCapability(state, entity);
    for (let i = 0; i < choices.length; i++) {
      if (i === selectedIndex && record.choices[i].availability === "PUBLIC_REPLAY")
        choices[i].target = target;
      else if (record.choices[i].availability === "PUBLIC_REPLAY") {
        choices[i].target = entityTarget(entity, context, choices[i]);
        materializedTargets++;
      }
    }
    const requiresChoice =
      choices.length > 1 &&
      !choices.some((choice) => choice.artifactId === context.anchor?.artifactId);
    return {
      key: record.key,
      id: record.id,
      type: record.type,
      namespace: record.namespace,
      label: record.label,
      kind:
        record.type === "workspace"
          ? "navigation"
          : record.type === "reference-listing"
            ? "reference"
            : "evidence",
      ...(record.market ? { market: record.market } : {}),
      artifactId: selected.artifactId,
      cutoff: selected.cutoff,
      availability: !capability.enabled
        ? "DISABLED"
        : record.type === "reference-listing"
          ? "REFERENCE"
          : "AVAILABLE",
      capability,
      rank: score,
      ...(capability.enabled && !requiresChoice ? { target } : {}),
      requiresChoice,
      choices,
    };
  });
  return {
    query: normalized,
    scope,
    results,
    total: candidates.length,
    limited: candidates.length > limit,
    materializedTargets,
  };
}
function aborted(): never {
  throw new DOMException("Search cancelled or superseded.", "AbortError");
}
export function createTerminalSearchService(
  options: {
    loadShard?: (name: TerminalShardName) => Promise<TerminalShard>;
    loadNavigation?: () => Promise<NavigationRecord[]>;
  } = {},
) {
  const loaded = new Map<TerminalShardName, TerminalShard>(),
    loadShard = options.loadShard ?? loadTerminalShard;
  const loadNavigation = options.loadNavigation ?? loadSearchNavigation;
  let navigation: readonly NavigationRecord[] | undefined,
    retained: readonly NavigationRecord[] | undefined,
    generation = 0;
  function rawCatalog(): SearchCatalog {
    const shards = [...loaded.values()];
    return {
      entities: catalogEntities(shards),
      bindings: Object.assign({}, ...shards.map((s) => s.bindings)),
      routes: Object.assign({}, ...shards.map((s) => s.routes)),
      projectionPins: Object.assign({}, ...shards.map((s) => s.projectionPins)),
    };
  }
  function catalog(history = false): SearchCatalog {
    const raw = rawCatalog();
    if (!navigation) return raw;
    return { ...raw, navigation: history && retained ? retained : navigation };
  }
  async function load(
    names: readonly TerminalWorkspace[] = [],
    history = false,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) aborted();
    if (names.some((name) => !Object.hasOwn(SHARDS, name)))
      throw new Error("Unknown search workspace.");
    navigation ??= await loadNavigation();
    if (history && !retained) {
      const seed = loaded.get("seed") ?? (await loadShard("seed"));
      if (seed.name !== "seed") throw new Error("Search seed identity mismatch.");
      loaded.set("seed", seed);
      for (const name of ["history", "history-archive"] as const) {
        const shard = loaded.get(name) ?? (await loadShard(name));
        if (shard.name !== name) throw new Error("Search history identity mismatch.");
        loaded.set(name, shard);
      }
      const { capabilityFor } = await import("./capabilities.ts");
      const alternatives = deriveNavigationRecords(rawCatalog(), "history", capabilityFor),
        merged = new Map(navigation.map((record) => [record.key, record]));
      const supplement = await loadRetainedSearchNavigation();
      for (const record of [...alternatives, ...supplement]) {
        const prior = merged.get(record.key);
        if (!prior) {
          merged.set(record.key, record);
          continue;
        }
        const choices = new Map(
          [...prior.choices, ...record.choices].map((choice) => [
            choice.artifactId ?? "static-reference",
            choice,
          ]),
        );
        merged.set(record.key, {
          ...prior,
          choices: [...choices.values()].sort(
            (a, b) =>
              compare(b.cutoff ?? "", a.cutoff ?? "") ||
              compare(a.artifactId ?? "", b.artifactId ?? ""),
          ),
        });
      }
      retained = [...merged.values()].sort((a, b) => compare(a.key, b.key));
    }
    if (signal?.aborted) aborted();
    return catalog(history);
  }
  return {
    catalog,
    loadedEntities: () => rawCatalog().entities,
    load,
    cancel: () => {
      generation++;
    },
    async search(
      query: string,
      context: InvestigationContext,
      searchOptions: TerminalSearchOptions = {},
    ): Promise<SearchResponse> {
      queryText(query);
      const ticket = ++generation;
      if (searchOptions.workspaces?.some((name) => !Object.hasOwn(SHARDS, name)))
        throw new Error("Unknown search workspace.");
      const marketOnly =
        !!searchOptions.types?.length &&
        searchOptions.types.every((type) => ["reference-listing", "market-factor"].includes(type));
      const emptyCurrent = (!query.trim() && !searchOptions.history) || marketOnly;
      if (emptyCurrent) {
        if (searchOptions.signal?.aborted) aborted();
        const seed = loaded.get("seed") ?? (await loadShard("seed"));
        loaded.set("seed", seed);
      }
      const data = emptyCurrent
        ? {
            entities: catalogEntities([loaded.get("seed")!]),
            bindings: loaded.get("seed")!.bindings,
            routes: loaded.get("seed")!.routes,
          }
        : await load(
            searchOptions.workspaces ?? [],
            searchOptions.history === true,
            searchOptions.signal,
          );
      if (ticket !== generation || searchOptions.signal?.aborted) aborted();
      const response = searchLoaded(query, context, {
        ...data,
        scope: searchOptions.history ? "history" : "current",
        limit: searchOptions.limit,
        types: searchOptions.types,
      });
      return response;
    },
  };
}
export type TerminalSearchService = ReturnType<typeof createTerminalSearchService>;
export const terminalSearch = createTerminalSearchService();
