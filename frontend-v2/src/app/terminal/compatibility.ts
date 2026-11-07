import {
  defaultContext,
  isArtifactId,
  parseInvestigationContext,
  serializeInvestigationContext,
  subjectMarket,
  type InvestigationContext,
  type InvestigationSubject,
  type InvestigationView,
  type Market,
  type TerminalWorkspace,
  type TypedOrigin,
} from "./context.ts";

export type ContextField = "subject" | "anchor" | "compare" | "observationDate" | "origin" | "view";
export type CompatibilityReason = { field: ContextField; code: string; message: string };
export type ArtifactAvailability = {
  status: "AVAILABLE" | "UNAVAILABLE";
  market?: Market;
  subject?: InvestigationSubject;
  kind?: string;
};
export type ContextBindings = {
  artifacts?: Readonly<Record<string, ArtifactAvailability>>;
  resolveArtifact?: (artifactId: string) => ArtifactAvailability | undefined;
  comparisonCompatible?: (left: string, right: string) => boolean;
  hasObservationDate?: (artifactId: string, date: string) => boolean;
  hasSelection?: (context: InvestigationContext) => boolean;
  hasOrigin?: (origin: TypedOrigin) => boolean;
};
export type ContextCompatibility = {
  applied: InvestigationContext;
  parked: Partial<
    Pick<
      InvestigationContext,
      "subject" | "anchor" | "compare" | "observationDate" | "origin" | "view"
    >
  >;
  unavailable: ContextField[];
  reasons: CompatibilityReason[];
};
const focusFields = [
  "issueId",
  "sweepId",
  "runId",
  "factorId",
  "sourceId",
  "originId",
  "admissionId",
  "sourceVersionId",
  "traceId",
  "traceStep",
  "cutoff",
  "dataWindowEnd",
] as const;
export function anchorAppliesTo(artifactId: string, destination: TerminalWorkspace): boolean {
  if (!isArtifactId(artifactId)) return false;
  const prefixes: Record<TerminalWorkspace, readonly string[]> = {
    market: ["market:"],
    world: ["world:"],
    risk: ["risk:"],
    regimes: ["regimes:", "regime:", "product:", "dynamics:"],
    factors: ["factors:", "regimes:factors:"],
    research: ["regimes:snapshot:", "factors:ledger:"],
    execution: [],
    observatory: ["observatory:"],
    agents: ["forge:", "plugins:"],
    data: ["data-organ:"],
  };
  return prefixes[destination].some((prefix) => artifactId.startsWith(prefix));
}
/** Compatibility never resolves an unknown identity, chooses latest or fetches evidence. */
export function adaptContext(
  context: InvestigationContext,
  destination: TerminalWorkspace,
  bindings?: ContextBindings,
  view?: InvestigationView,
): ContextCompatibility {
  const original = parseInvestigationContext(
    context.view.workspace,
    serializeInvestigationContext(context),
  );
  if (view && view.workspace !== destination)
    throw new Error("Destination view belongs to another workspace.");
  const applied: InvestigationContext = {
    ...original,
    view:
      view ??
      (original.view.workspace === destination ? original.view : defaultContext(destination).view),
  };
  const result: ContextCompatibility = { applied, parked: {}, unavailable: [], reasons: [] };
  const mark = (field: ContextField, code: string, message: string, unavailable = false) => {
    const value = applied[field];
    if (value !== undefined) {
      Object.assign(result.parked, { [field]: value });
      if (field !== "view") delete applied[field];
      else {
        const safeView = { ...applied.view } as InvestigationView & Record<string, unknown>;
        for (const key of focusFields) delete safeView[key];
        applied.view = safeView;
      }
    }
    if (unavailable && !result.unavailable.includes(field)) result.unavailable.push(field);
    result.reasons.push({ field, code, message });
  };
  if (original.view.workspace !== destination && Object.keys(original.view).length > 1) {
    result.parked.view = original.view;
    result.reasons.push({
      field: "view",
      code: "VIEW_NOT_APPLICABLE",
      message: `The ${original.view.workspace} panel and filters belong to that workspace; the evidence origin remains available.`,
    });
  }
  const referenceSubjectUnsupported =
    applied.subject?.kind === "reference-listing" &&
    ["risk", "regimes", "factors", "data", "research", "observatory"].includes(destination);
  if (referenceSubjectUnsupported)
    mark(
      "subject",
      "SUBJECT_NOT_APPLICABLE",
      "CONTEXT NOT APPLICABLE: this reference listing has no admitted aggregate assessment here. Choose a market factor explicitly; a listing is never converted automatically.",
      true,
    );
  else if (destination === "world" || destination === "agents" || destination === "execution") {
    if (applied.subject)
      mark(
        "subject",
        "SUBJECT_NOT_APPLICABLE",
        `CONTEXT NOT APPLICABLE: ${destination} does not establish market-subject relationships. The investigation origin is preserved.`,
      );
  }
  const resolve = (id: string) => bindings?.resolveArtifact?.(id) ?? bindings?.artifacts?.[id];
  for (const field of ["anchor", "compare"] as const) {
    const anchor = applied[field];
    if (!anchor) continue;
    if (!anchorAppliesTo(anchor.artifactId, destination)) {
      mark(
        field,
        "ANCHOR_NOT_APPLICABLE",
        `CONTEXT NOT APPLICABLE: ${anchor.artifactId} is an evidence identity for a different workspace. It is preserved, not replaced with latest.`,
        true,
      );
      continue;
    }
    const entry = resolve(anchor.artifactId);
    if (!entry || entry.status !== "AVAILABLE") {
      mark(
        field,
        entry ? "ANCHOR_UNAVAILABLE" : "ANCHOR_NOT_VERIFIED",
        `${anchor.artifactId} is ${entry ? "UNAVAILABLE" : "not in the verified bindings"}; no alternative artifact was selected.`,
        true,
      );
      continue;
    }
    if (entry.market && applied.market && entry.market !== applied.market) {
      mark(
        field,
        "ANCHOR_MARKET_MISMATCH",
        "CONTEXT NOT APPLICABLE: evidence and selected market disagree.",
        true,
      );
      continue;
    }
    if (
      entry.subject &&
      applied.subject &&
      (entry.subject.kind !== applied.subject.kind ||
        subjectMarket(entry.subject) !== subjectMarket(applied.subject) ||
        JSON.stringify(entry.subject) !== JSON.stringify(applied.subject))
    )
      mark(
        field,
        "ANCHOR_SUBJECT_MISMATCH",
        "CONTEXT NOT APPLICABLE: evidence is bound to a different subject identity.",
        true,
      );
  }
  if (
    applied.compare &&
    (!applied.anchor ||
      !bindings?.comparisonCompatible?.(applied.anchor.artifactId, applied.compare.artifactId))
  )
    mark(
      "compare",
      "COMPARISON_NOT_PROVEN",
      "NOT_COMPARABLE: no exact compatible country, source, policy/control and clock basis was established.",
      true,
    );
  if (applied.observationDate) {
    if (!["market", "regimes", "factors"].includes(destination))
      mark(
        "observationDate",
        "DATE_AXIS_NOT_APPLICABLE",
        "CONTEXT NOT APPLICABLE: an observation date is not this workspace's publication clock or optimization step.",
      );
    else if (
      !applied.anchor ||
      !bindings?.hasObservationDate?.(applied.anchor.artifactId, applied.observationDate)
    )
      mark(
        "observationDate",
        "DATE_NOT_PROVEN",
        "No exact compatible observation exists at this date. No nearest date or calendar conversion was substituted.",
        true,
      );
  }
  if (applied.origin && !bindings?.hasOrigin?.(applied.origin))
    mark(
      "origin",
      "ORIGIN_NOT_VERIFIED",
      "The investigation origin has not been proven against its exact artifact/entity/owner bindings; it is preserved but not enabled as a verified link.",
      true,
    );
  const focused = focusFields.some((key) => key in applied.view);
  if (focused && (!bindings?.hasSelection || !bindings.hasSelection(applied)))
    mark(
      "view",
      "SELECTION_NOT_VERIFIED",
      "The requested entity selection requires its exact verified artifact/owner binding; no similarly named entity was selected.",
      true,
    );
  return result;
}
export const contextCompatibility = adaptContext;
