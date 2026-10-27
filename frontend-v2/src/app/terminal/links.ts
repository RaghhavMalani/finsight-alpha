import {
  WORKSPACE_PATHS,
  ContextError,
  contextQuery,
  defaultContext,
  isArtifactId,
  isHashId,
  isIssueId,
  parseInvestigationContext,
  serializeInvestigationContext,
  type EvidenceAnchor,
  type InvestigationContext,
  type InvestigationView,
  type TerminalWorkspace,
  type TypedOrigin,
} from "./context.ts";

export const RELATIONS = [
  "REFERENCED_ARTIFACT",
  "ISSUE_ORIGIN",
  "DECLARED_PRODUCER",
  "DECLARED_SOURCE_VERSION",
  "DECLARED_ADMISSION",
  "DECLARED_CAPTURE",
  "PRESENT_IN",
] as const;
export type InvestigationRelation = (typeof RELATIONS)[number];
export const EVIDENCE_SELECTORS = [
  "risk_issue_evidence",
  "risk_issue_origin",
  "factor_original_ref",
  "declared_producer",
  "declared_source_version",
  "declared_admission",
  "declared_capture",
  "recorded_task_artifact",
  "frozen_research_summary",
  "referenced_artifact",
  "present_in",
] as const;
export type EvidenceSelector = (typeof EVIDENCE_SELECTORS)[number];
export type EvidenceEntityRef = { artifactId: string; entityId?: string };
export type RelationProof = {
  relation: InvestigationRelation;
  source: EvidenceEntityRef;
  destination: EvidenceEntityRef;
  evidenceArtifactId: string;
  selector: EvidenceSelector;
};
export type InvestigationTarget = {
  workspace: TerminalWorkspace;
  to: string;
  search: Record<string, string>;
  context: InvestigationContext;
  relation?: RelationProof;
};
function reject(message: string): never {
  throw new ContextError("UNPROVEN_LINK", message);
}
function selectedEntity(context: InvestigationContext): string | undefined {
  const view = context.view;
  return view.workspace === "risk"
    ? view.issueId
    : view.workspace === "factors"
      ? view.factorId
      : view.workspace === "regimes" || view.workspace === "agents"
        ? view.runId
        : view.workspace === "data"
          ? (view.originId ?? view.admissionId ?? view.sourceVersionId)
          : view.workspace === "observatory"
            ? view.traceId
            : undefined;
}
function exactRef(value: EvidenceEntityRef) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).some((key) => !["artifactId", "entityId"].includes(key)) ||
    !isArtifactId(value.artifactId)
  )
    reject("Evidence link needs an exact artifact reference.");
  if (
    value.entityId !== undefined &&
    !(
      isHashId(value.entityId) ||
      isIssueId(value.entityId) ||
      /^(?:us|india):(?:mkt|smb|hml|rf|mom)$/.test(value.entityId) ||
      /^v025_case_\d{3}$/.test(value.entityId)
    )
  )
    reject("Evidence link entity identifier is not an exact supported ID.");
}
export function validateRelationProof(proof: RelationProof): RelationProof {
  if (
    !proof ||
    typeof proof !== "object" ||
    Object.keys(proof).some(
      (key) =>
        !["relation", "source", "destination", "evidenceArtifactId", "selector"].includes(key),
    ) ||
    !RELATIONS.includes(proof.relation) ||
    !EVIDENCE_SELECTORS.includes(proof.selector) ||
    !isArtifactId(proof.evidenceArtifactId)
  )
    reject("Unsupported evidence relation or selector.");
  exactRef(proof.source);
  exactRef(proof.destination);
  const allowed: Record<InvestigationRelation, readonly EvidenceSelector[]> = {
    REFERENCED_ARTIFACT: [
      "risk_issue_evidence",
      "factor_original_ref",
      "recorded_task_artifact",
      "frozen_research_summary",
      "referenced_artifact",
    ],
    ISSUE_ORIGIN: ["risk_issue_origin"],
    DECLARED_PRODUCER: ["declared_producer"],
    DECLARED_SOURCE_VERSION: ["declared_source_version"],
    DECLARED_ADMISSION: ["declared_admission"],
    DECLARED_CAPTURE: ["declared_capture"],
    PRESENT_IN: ["present_in"],
  };
  if (!allowed[proof.relation].includes(proof.selector))
    reject("Evidence relation and fixed selector disagree.");
  return proof;
}
/** Ordinary workspace navigation preserves identity; the destination adapter explains parked fields. */
export function buildInvestigationTarget(
  context: InvestigationContext,
  destination: TerminalWorkspace,
  view?: InvestigationView,
): InvestigationTarget {
  if (view && view.workspace !== destination) reject("Target view belongs to another workspace.");
  const targetContext: InvestigationContext = {
    ...context,
    view:
      view ??
      (context.view.workspace === destination ? context.view : defaultContext(destination).view),
  };
  const search = serializeInvestigationContext(targetContext);
  const checked = parseInvestigationContext(destination, search);
  const to =
    destination === "agents" && checked.view.workspace === "agents" && checked.view.runId
      ? `/runs/${checked.view.runId}`
      : WORKSPACE_PATHS[destination];
  if (!to) reject("Unknown target workspace.");
  return { workspace: destination, to, search, context: checked };
}
/** A declared relationship must match an independently verified edge; syntax alone never enables it. */
export function makeEvidenceTarget(
  context: InvestigationContext,
  destination: TerminalWorkspace,
  anchor: EvidenceAnchor,
  view: InvestigationView,
  proof: RelationProof,
  verify: (proof: RelationProof) => boolean,
): InvestigationTarget {
  validateRelationProof(proof);
  if (!context.anchor || context.anchor.artifactId !== proof.source.artifactId)
    reject("Evidence relation does not belong to the selected exact source artifact.");
  const sourceEntity = selectedEntity(context),
    destinationEntity = selectedEntity({ ...context, anchor, view });
  if (sourceEntity && proof.source.entityId !== sourceEntity)
    reject("Evidence relation does not belong to the selected exact source entity.");
  if (destinationEntity && proof.destination.entityId !== destinationEntity)
    reject(
      "Evidence relation does not prove the selected destination entity. A container reference cannot choose a run or item.",
    );
  if (
    !isArtifactId(anchor.artifactId) ||
    proof.destination.artifactId !== anchor.artifactId ||
    typeof verify !== "function" ||
    verify(proof) !== true
  )
    reject("Impact relationship unavailable: the exact declared edge was not verified.");
  let origin: TypedOrigin | undefined = context.origin;
  if (!origin && context.view.workspace === "risk" && context.view.issueId)
    reject("An Issue evidence link requires its exact owning state/sweep origin tuple.");
  if (!origin && context.anchor)
    origin = { kind: "artifact", artifactId: context.anchor.artifactId };
  const target = buildInvestigationTarget(
    { ...context, anchor, compare: undefined, ...(origin ? { origin } : {}) },
    destination,
    view,
  );
  return { ...target, relation: proof };
}
export function targetHref(target: InvestigationTarget): string {
  if (target.context.view.workspace !== target.workspace)
    reject("Target workspace and typed view disagree.");
  if (
    target.workspace === "agents" &&
    target.to.startsWith("/runs/") &&
    (target.context.view.workspace !== "agents" ||
      target.to !== `/runs/${target.context.view.runId}`)
  )
    reject("Recorded run path and exact selected run disagree.");
  if (
    target.to !== WORKSPACE_PATHS[target.workspace] &&
    !(target.workspace === "agents" && /^\/runs\/[a-f0-9]{64}$/.test(target.to))
  )
    reject("Target path is not a supported workspace route.");
  const canonical = serializeInvestigationContext(target.context);
  if (
    Object.keys(canonical).length !== Object.keys(target.search).length ||
    Object.entries(canonical).some(([key, value]) => target.search[key] !== value)
  )
    reject("Target search and typed context disagree.");
  return `${target.to}?${contextQuery(target.context)}`;
}
export function riskIssueOrigin(
  issueId: string,
  stateArtifactId: string,
  sweepArtifactId: string,
): TypedOrigin {
  const context = parseInvestigationContext(
    "risk",
    new URLSearchParams({
      originIssue: issueId,
      originState: stateArtifactId,
      originSweep: sweepArtifactId,
    }),
  );
  return context.origin!;
}
