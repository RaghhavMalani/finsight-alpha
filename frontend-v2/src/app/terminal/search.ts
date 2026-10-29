import { resolveInstrument } from "../../markets/instruments.ts";
import type { ReplayEntry } from "../../replay/contracts.ts";
import { WORKSPACES } from "../workspaces.ts";
import {
  catalogEntities,
  loadTerminalShard,
  stableTerminal,
  type TerminalEntity,
  type TerminalShard,
  type TerminalShardName,
} from "./catalog.ts";
import {
  capabilityFor,
  publicDerivativeAvailable,
  type Capability,
  type CapabilityFeature,
} from "./capabilities.ts";
import {
  serializeInvestigationContext,
  type InvestigationContext,
  type InvestigationView,
  type TerminalWorkspace,
} from "./context.ts";
import { buildInvestigationTarget, type InvestigationTarget } from "./links.ts";

export type SearchCatalog = {
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
function feature(entity: TerminalEntity): CapabilityFeature {
  if (entity.type === "reference-listing") return "reference-navigation";
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
function rank(entity: TerminalEntity, query: string): number {
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
        ? !publicDerivativeAvailable(options.bindings[entity.artifactId])
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
        if (choice.artifactId && !publicDerivativeAvailable(options.bindings[choice.artifactId]))
          continue;
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
    const capability = capabilityFor({
      feature: feature(entity),
      context: target.context,
      binding,
      selectionAvailable: true,
      hasDisplayProjection:
        !!options.projectionPins?.[`${selected.artifactId}|observatory-trace-window`],
    });
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
      capability: capabilityFor({ feature: "execution" }),
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
  };
}
function aborted(): never {
  throw new DOMException("Search cancelled or superseded.", "AbortError");
}
export function createTerminalSearchService(
  options: { loadShard?: (name: TerminalShardName) => Promise<TerminalShard> } = {},
) {
  const loaded = new Map<TerminalShardName, TerminalShard>(),
    loadShard = options.loadShard ?? loadTerminalShard;
  let generation = 0;
  function catalog(): SearchCatalog {
    const shards = [...loaded.values()],
      bindings: Record<string, ReplayEntry> = {},
      routes: Record<string, string> = {},
      projectionPins: Record<string, string> = {};
    for (const shard of shards) {
      for (const [id, entry] of Object.entries(shard.bindings)) {
        if (bindings[id] && stableTerminal(bindings[id]) !== stableTerminal(entry))
          throw new Error("Conflicting exact search artifact bindings.");
        bindings[id] = entry;
      }
      Object.assign(routes, shard.routes);
      Object.assign(projectionPins, shard.projectionPins);
    }
    const entities = catalogEntities(shards);
    if (entities.length > 4096) throw new Error("Search index exceeds4096 entity records.");
    return { entities, bindings, routes, projectionPins };
  }
  async function load(
    names: readonly TerminalWorkspace[] = [],
    history = false,
    signal?: AbortSignal,
  ) {
    if (signal?.aborted) aborted();
    const requested = [
      ...new Set<TerminalShardName>([
        "seed",
        ...names.map((name) => {
          if (!Object.hasOwn(SHARDS, name)) throw new Error("Unknown search workspace.");
          return SHARDS[name];
        }),
        ...(history ? ["history" as const] : []),
      ]),
    ];
    const shards = await Promise.all(
      requested.map(async (name) => {
        const shard = loaded.get(name) ?? (await loadShard(name));
        if (shard.name !== name || shard.entities.length > 512)
          throw new Error("Search shard identity/capacity mismatch.");
        return shard;
      }),
    );
    if (signal?.aborted) aborted();
    for (const shard of shards) loaded.set(shard.name, shard);
    return catalog();
  }
  return {
    catalog,
    loadedEntities: () => catalog().entities,
    load,
    cancel: () => {
      generation++;
    },
    async search(
      query: string,
      context: InvestigationContext,
      searchOptions: TerminalSearchOptions = {},
    ): Promise<SearchResponse> {
      const normalized = queryText(query),
        ticket = ++generation;
      const names =
        searchOptions.workspaces ??
        (normalized ? (Object.keys(SHARDS) as TerminalWorkspace[]) : []);
      const data = await load(names, searchOptions.history === true, searchOptions.signal);
      if (ticket !== generation || searchOptions.signal?.aborted) aborted();
      return searchLoaded(query, context, {
        ...data,
        scope: searchOptions.history ? "history" : "current",
        limit: searchOptions.limit,
        types: searchOptions.types,
      });
    },
  };
}
export type TerminalSearchService = ReturnType<typeof createTerminalSearchService>;
export const terminalSearch = createTerminalSearchService();
