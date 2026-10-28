import type { Instrument } from "../../markets/instruments.ts";
import { WORKSPACES } from "../workspaces.ts";
import {
  capabilityFor,
  publicDerivativeAvailable,
  type Capability,
  type CapabilityEnvironment,
} from "./capabilities.ts";
import {
  isHashId,
  isIssueId,
  parseInvestigationContext,
  serializeInvestigationContext,
  subjectTicker,
  workspaceOf,
  type InvestigationContext,
  type InvestigationView,
  type Market,
  type TerminalWorkspace,
} from "./context.ts";
import { buildInvestigationTarget, type InvestigationTarget } from "./links.ts";
import { searchLoaded, type SearchCatalog, type SearchResult } from "./search.ts";

export type LegacyCommandTarget = {
  to: string;
  search: Record<string, string>;
  instrument?: Instrument;
};
export type LegacyCommandParser = (text: string, currentTicker?: string) => LegacyCommandTarget;
export type CommandChoice = {
  label: string;
  artifactId?: string | null;
  cutoff?: string | null;
  target?: InvestigationTarget;
  reason?: string;
};
export type LegacyMarketNavigation = {
  kind: "legacy-market";
  to: "/markets/options" | "/markets/fundamentals";
  search: Record<string, string>;
  context: InvestigationContext;
  instrument?: Instrument;
};
export type CommandResolution =
  | { status: "READY"; target: InvestigationTarget; capability: Capability; note?: string }
  | {
      status: "LEGACY_READY";
      navigation: LegacyMarketNavigation;
      capability: Capability;
      note: string;
    }
  | { status: "CHOOSE"; reason: string; correction: string; choices: CommandChoice[] }
  | { status: "REJECTED"; reason: string; correction: string; choices: CommandChoice[] };
export type CommandOptions = SearchCatalog & {
  legacyParser: LegacyCommandParser;
  environment?: CapabilityEnvironment;
  comparisonCompatible?: (left: string, right: string, workspace: TerminalWorkspace) => boolean;
};
export const COMMAND_HELP = [
  "US REG",
  "INDIA REG",
  "RISK HIGH",
  "RISK MODEL",
  "DATA IIMA",
  "FACTOR india:mom INDIA",
  "ISSUE risk-issue:<full64hex>",
  "RUN regime:<full64hex>",
  "RUN agent:<full64hex>",
  "CHANGES INDIA",
  "COMPARE US INDIA REG",
  "TICKER [EXCHANGE] FUNCTION GO",
] as const;
const fail = (
  reason: string,
  correction = "Use an explicit supported command or choose a verified result.",
  choices: CommandChoice[] = [],
): CommandResolution => ({ status: "REJECTED", reason, correction, choices });
const choose = (
  reason: string,
  choices: CommandChoice[],
  correction = "Choose an exact retained cutoff/selection; no default was substituted.",
): CommandResolution => ({ status: "CHOOSE", reason, correction, choices });
function ready(
  target: InvestigationTarget,
  feature: Parameters<typeof capabilityFor>[0]["feature"],
  note?: string,
): CommandResolution {
  return {
    status: "READY",
    target,
    capability: capabilityFor({ feature, context: target.context }),
    ...(note ? { note } : {}),
  };
}
function marketContext(
  context: InvestigationContext,
  market: Market,
  view: InvestigationView,
): InvestigationContext {
  const same = context.market === market;
  return {
    ...context,
    market,
    subject: { kind: "market-factor", id: market === "INDIA" ? "IN-MKT" : "US-MKT" },
    ...(!same ? { anchor: undefined, compare: undefined, observationDate: undefined } : {}),
    view,
  };
}
function choicesFor(results: readonly SearchResult[]): CommandChoice[] {
  return results.flatMap((result) =>
    result.choices.map((choice) => ({
      label: `${result.label}${choice.cutoff ? " · " + choice.cutoff : ""}`,
      artifactId: choice.artifactId,
      cutoff: choice.cutoff,
      ...(choice.target ? { target: choice.target } : { reason: result.capability.reason }),
    })),
  );
}
function exactResults(
  id: string,
  types: readonly string[],
  context: InvestigationContext,
  options: CommandOptions,
): SearchResult[] {
  return searchLoaded(id, context, {
    ...options,
    scope: "history",
    types,
    limit: 50,
  }).results.filter((result) => result.id.toLowerCase() === id.toLowerCase());
}
function pick(
  results: readonly SearchResult[],
  context: InvestigationContext,
  options: CommandOptions,
  current = false,
): CommandResolution {
  const choices = choicesFor(results),
    enabled = choices.filter((choice) => choice.target);
  if (!enabled.length)
    return fail(
      results[0]?.capability.reason ?? "No exact AVAILABLE public entity matches this ID.",
      "Use the complete identifier and its explicit namespace, or select eligible retained metadata.",
      choices,
    );
  const selected = enabled.filter(
    (choice) =>
      choice.artifactId === context.anchor?.artifactId ||
      (context.view.workspace === "risk" &&
        context.view.sweepId &&
        choice.target?.context.view.workspace === "risk" &&
        choice.target.context.view.sweepId === context.view.sweepId),
  );
  const currentState = options.routes?.["/risk-manager/state"];
  const preferred = selected.length
    ? selected
    : current
      ? enabled.filter((choice) => choice.artifactId === currentState)
      : [];
  const distinct = new Map(
    (preferred.length ? preferred : enabled).map((choice) => [
      JSON.stringify(choice.target?.search),
      choice,
    ]),
  );
  if (distinct.size !== 1)
    return choose("This semantic identity has more than one exact retained selection.", [
      ...distinct.values(),
    ]);
  const target = [...distinct.values()][0].target!;
  const feature =
    target.workspace === "risk"
      ? "risk-evidence"
      : target.workspace === "data"
        ? "data-diagnostics"
        : target.workspace === "factors"
          ? "factor-evidence"
          : target.workspace === "agents"
            ? "recorded-agent-runs"
            : "regime-dashboard";
  return ready(target, feature);
}
/** Workspaces whose public metadata is needed before parsing an exact-ID command. */
export function commandWorkspaces(text: string): TerminalWorkspace[] {
  const head = text.trim().split(/\s+/)[0]?.toUpperCase();
  if (head === "ISSUE" || head === "RISK" || head === "CHANGES") return ["risk"];
  if (head === "DATA") return ["data"];
  if (head === "FACTOR") return ["factors"];
  if (head === "RUN") return ["regimes", "factors", "agents"];
  if (head === "COMPARE") return ["regimes"];
  if (/\bOBS(?:\s+(?:GO|<GO>))?\s*$/i.test(text)) return ["observatory"];
  return [];
}
/** Parsing produces navigation only. No command executes code, calls an API or performs science. */
export function resolveTerminalCommand(
  text: string,
  context: InvestigationContext,
  options: CommandOptions,
): CommandResolution {
  try {
    if (
      typeof text !== "string" ||
      text.length > 160 ||
      [...text].some((c) => c.codePointAt(0)! < 32 || c.codePointAt(0) === 127)
    )
      return fail("Command text is invalid or exceeds160 characters.");
    // Validate the existing typed context before carrying anything into a target.
    serializeInvestigationContext(context);
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    if (["GO", "<GO>"].includes(tokens.at(-1)?.toUpperCase() ?? "")) tokens.pop();
    const upper = tokens.map((token) => token.toUpperCase()),
      head = upper[0];
    if (!tokens.length)
      return fail("Enter a command.", "For example: INDIA REG, RISK HIGH, or RELIANCE IN DES.");
    if (upper.some((token) => ["GO", "<GO>"].includes(token)))
      return fail("GO is allowed once, at the end.");
    if (
      [
        "BUY",
        "SELL",
        "TRADE",
        "ORDER",
        "EXECUTE",
        "TRAIN",
        "FIT",
        "REFRESH",
        "CAPTURE",
        "DEPLOY",
      ].includes(head)
    )
      return fail(
        "Trading, collection and execution verbs are unavailable in the investigation terminal.",
        "Open retained evidence with REG, RISK, FACTOR, DATA, ISSUE or RUN.",
      );
    if (tokens.length === 2 && ["US", "INDIA"].includes(head) && upper[1] === "REG") {
      const next = marketContext(context, head as Market, {
        workspace: "regimes",
        panel: "overview",
      });
      return ready(buildInvestigationTarget(next, "regimes"), "regime-dashboard");
    }
    if (head === "RISK" && tokens.length === 2) {
      const filter = upper[1],
        severity = ["HIGH", "MEDIUM", "LOW"].includes(filter),
        category = ["MODEL", "DATA", "SYSTEM"].includes(filter);
      if (!severity && !category)
        return fail("Unknown Risk filter.", "Use RISK HIGH, MEDIUM, LOW, MODEL, DATA or SYSTEM.");
      return ready(
        buildInvestigationTarget(context, "risk", {
          workspace: "risk",
          panel: "feed",
          ...(severity
            ? { severity: filter as "HIGH" | "MEDIUM" | "LOW" }
            : { category: filter as "MODEL" | "DATA" | "SYSTEM" }),
        }),
        "risk-evidence",
        "Category/severity filtering only; no model fit or provider refresh.",
      );
    }
    if (head === "DATA" && tokens.length === 2) {
      const input = tokens[1].toLowerCase();
      const sources = options.entities.filter(
        (entity) =>
          entity.type === "data-source" &&
          entity.availability === "AVAILABLE" &&
          !!entity.artifactId &&
          publicDerivativeAvailable(options.bindings[entity.artifactId]) &&
          (entity.id.toLowerCase() === input || entity.id.split(":")[0].toLowerCase() === input),
      );
      const identities = [...new Set(sources.map((entity) => entity.id))];
      if (identities.length !== 1)
        return identities.length
          ? choose(
              "Source alias is ambiguous across admitted identities.",
              identities.flatMap((id) =>
                choicesFor(exactResults(id, ["data-source"], context, options)),
              ),
            )
          : fail(
              "Unknown source or alias; only admitted source identities can be selected.",
              "Use a complete source ID, or a uniquely resolving alias such as IIMA.",
            );
      return pick(exactResults(identities[0], ["data-source"], context, options), context, options);
    }
    if (head === "FACTOR") {
      if (tokens.length !== 3 || !["US", "INDIA"].includes(upper[2]))
        return fail(
          "Factor commands need an explicit country.",
          "Use FACTOR india:mom INDIA or FACTOR us:mom US.",
        );
      const market = upper[2] as Market,
        input = tokens[1].toLowerCase();
      const id = input.includes(":") ? input : `${market.toLowerCase()}:${input}`;
      if (
        !/^(?:us|india):(?:mkt|smb|hml|rf|mom)$/.test(id) ||
        !id.startsWith(market.toLowerCase() + ":")
      )
        return fail(
          "Factor ID and country conflict or are not in the reviewed catalogue.",
          "Use the exact country-qualified catalogue ID.",
        );
      const results = exactResults(id, ["factor"], context, options).filter(
        (result) => result.market === market,
      );
      const routeIds = new Set(
        Object.entries(options.routes ?? {})
          .filter(([route]) => !/[?&](?:as_of|at|cutoff)=/.test(route))
          .map(([, artifact]) => artifact),
      );
      const narrowed = results.map((result) => ({
        ...result,
        choices: result.choices.filter((choice) =>
          context.anchor
            ? choice.artifactId === context.anchor.artifactId
            : routeIds.has(choice.artifactId ?? ""),
        ),
      }));
      return pick(
        narrowed.some((result) => result.choices.length) ? narrowed : results,
        context,
        options,
      );
    }
    if (head === "ISSUE") {
      if (tokens.length !== 2 || !isIssueId(tokens[1]))
        return fail(
          "ISSUE needs the complete semantic risk-issue: identifier.",
          "Use ISSUE risk-issue:<64 lowercase hex characters>; displayed abbreviations are not identifiers.",
        );
      return pick(exactResults(tokens[1], ["issue"], context, options), context, options, true);
    }
    if (head === "RUN") {
      const match = tokens.length === 2 ? /^(regime|agent):([a-f0-9]{64})$/i.exec(tokens[1]) : null;
      if (!match || !isHashId(match[2]))
        return fail(
          "RUN requires an explicit supported namespace and complete ID.",
          "Use RUN regime:<64 lowercase hex> or RUN agent:<64 lowercase hex>.",
        );
      return pick(
        exactResults(
          match[2],
          match[1].toLowerCase() === "agent" ? ["recorded-agent-run"] : ["model-run"],
          context,
          options,
        ).filter((result) =>
          match[1].toLowerCase() === "agent"
            ? result.namespace === "agent"
            : ["regime", "factor-declared"].includes(result.namespace),
        ),
        context,
        options,
      );
    }
    if (head === "CHANGES") {
      if (tokens.length !== 2 || !["US", "INDIA"].includes(upper[1]))
        return fail(
          "CHANGES needs an explicit country.",
          "Use CHANGES US or CHANGES INDIA, then choose two compatible anchors.",
        );
      const market = upper[1] as Market,
        workspace = context.view.workspace;
      if (
        !["risk", "regimes", "factors", "data"].includes(workspace) ||
        context.market !== market ||
        !context.anchor ||
        !context.compare ||
        !publicDerivativeAvailable(options.bindings[context.anchor.artifactId]) ||
        !publicDerivativeAvailable(options.bindings[context.compare.artifactId]) ||
        options.comparisonCompatible?.(
          context.anchor.artifactId,
          context.compare.artifactId,
          workspace,
        ) !== true
      )
        return choose(
          "Two exact verified anchors with a declared compatible basis are required. No comparison was inferred.",
          [],
          "Choose matching country/source/policy/control anchors in Risk, Regimes, Factors or Data, then run CHANGES again.",
        );
      return ready(
        buildInvestigationTarget(context, workspace, {
          workspace,
          panel: "changes",
        } as InvestigationView),
        workspace === "risk"
          ? "risk-evidence"
          : workspace === "regimes"
            ? "regime-dashboard"
            : workspace === "factors"
              ? "factor-evidence"
              : "data-diagnostics",
        "Metadata/history comparison only; clocks remain independent and no causal explanation is claimed.",
      );
    }
    if (head === "COMPARE") {
      if (upper.join(" ") !== "COMPARE US INDIA REG")
        return fail(
          "Only the retained US/India regime matrix is supported.",
          "Use COMPARE US INDIA REG.",
        );
      const id = options.routes?.["/regimes/matrix"],
        entry = id ? options.bindings[id] : undefined;
      if (!id || !publicDerivativeAvailable(entry))
        return choose(
          "Load the admitted Regimes matrix before opening comparison.",
          [],
          "Choose the retained cross-market matrix; no synchronized calendar or economic comparability is implied.",
        );
      return ready(
        buildInvestigationTarget(
          {
            version: 1,
            anchor: { artifactId: id },
            view: { workspace: "regimes", panel: "overview", mode: "compare" },
            ...(context.origin ? { origin: context.origin } : {}),
          },
          "regimes",
        ),
        "regime-dashboard",
        "Retained cross-market matrix with independently labelled cutoffs and calendars; no synchronized economic comparison.",
      );
    }
    // The caller supplies the unchanged legacy parser, preventing an import cycle with mnemonics.
    const legacy = options.legacyParser(text, subjectTicker(context.subject) ?? "SPY"),
      destination = workspaceOf(legacy.to);
    if (!destination) return fail("The legacy function has no supported navigation route.");
    const workspaceOnly =
      tokens.length === 1 &&
      WORKSPACES.some((workspace) => workspace.command === head || workspace.label === head);
    const parsed = workspaceOnly
      ? { ...context, view: { workspace: destination } as InvestigationView }
      : {
          ...parseInvestigationContext(destination, legacy.search),
          ...(context.origin ? { origin: { ...context.origin } } : {}),
        };
    if (legacy.to === "/markets/options" || legacy.to === "/markets/fundamentals") {
      return {
        status: "LEGACY_READY",
        navigation: {
          kind: "legacy-market",
          to: legacy.to,
          search: { ...legacy.search, ...serializeInvestigationContext(parsed) },
          context: parsed,
          ...(legacy.instrument ? { instrument: legacy.instrument } : {}),
        },
        capability: capabilityFor({
          feature: legacy.to.endsWith("options") ? "market-options" : "market-fundamentals",
          context: parsed,
          environment: options.environment,
        }),
        note: "Opens the existing guarded route or its Local Live explanation. No operation is invoked by this command.",
      };
    }
    if (destination === "observatory") {
      // Empty search intentionally excludes evidence, so use the exact subject ID query for eligible recordings.
      const eligible = searchLoaded(subjectTicker(parsed.subject) ?? "recorded trace", parsed, {
        ...options,
        scope: "current",
        types: ["recorded-trace"],
        limit: 50,
      }).results;
      const matching = eligible.filter(
        (result) =>
          parsed.subject?.kind === "market-factor" &&
          result.id === `observatory:${parsed.subject.id}:hmm` &&
          result.target,
      );
      if (matching.length === 1)
        return { status: "READY", target: matching[0].target!, capability: matching[0].capability };
      const all = eligible.length
        ? eligible
        : searchLoaded("recorded", parsed, {
            ...options,
            scope: "current",
            types: ["recorded-trace"],
            limit: 50,
          }).results;
      return choose(
        "The selected identity has no eligible recorded HMM trace. Choose an AVAILABLE aggregate recording.",
        choicesFor(all),
      );
    }
    const target = buildInvestigationTarget(parsed, destination);
    return ready(
      target,
      destination === "execution"
        ? "execution"
        : destination === "market"
          ? "reference-navigation"
          : destination === "world"
            ? "recorded-world"
            : destination === "agents"
              ? "recorded-agent-runs"
              : destination === "factors"
                ? "factor-evidence"
                : destination === "risk"
                  ? "risk-evidence"
                  : destination === "data"
                    ? "data-diagnostics"
                    : destination === "research"
                      ? "frozen-research"
                      : "regime-dashboard",
      destination === "execution" ? "Explanation only; no execution capability." : undefined,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Command could not be resolved.",
      "Use a supported exact command; listing/exchange conflicts and ambiguous IDs cannot be coerced.",
    );
  }
}
