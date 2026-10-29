import type { MouseEvent, ReactNode } from "react";
import { useInvestigation } from "./TerminalShell";
import type { Capability } from "./capabilities";
import {
  targetHref,
  validateRelationProof,
  type InvestigationTarget,
  type RelationProof,
} from "./links";

type EvidenceLinkProps = {
  target?: InvestigationTarget;
  children: ReactNode;
  purpose?: "evidence" | "navigation";
  verifyRelation?: (proof: RelationProof) => boolean;
  unavailableReason?: string;
  capability?: Capability;
  className?: string;
  openInNewTab?: boolean;
};

/** Native links retain browser gestures; an evidence label always needs an independent edge check. */
export function EvidenceLink({
  target,
  children,
  purpose = "evidence",
  verifyRelation,
  unavailableReason,
  capability,
  className = "text-primary underline underline-offset-4",
  openInNewTab = false,
}: EvidenceLinkProps) {
  const { openTarget } = useInvestigation();
  let href: string | undefined;
  let reason = unavailableReason ?? "No exact declared evidence relationship is available.";
  try {
    if (target) {
      if (capability && !capability.enabled)
        throw new Error(capability.disabledReason ?? capability.reason);
      if (purpose === "evidence") {
        const proof = target.relation;
        if (!proof || !verifyRelation) throw new Error(reason);
        validateRelationProof(proof);
        if (
          target.context.anchor?.artifactId !== proof.destination.artifactId ||
          verifyRelation(proof) !== true
        )
          throw new Error("The exact source, destination and declared edge could not be verified.");
        const view = target.context.view;
        const destinationEntity =
          view.workspace === "risk"
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
        if (destinationEntity && destinationEntity !== proof.destination.entityId)
          throw new Error("A container relation cannot select an unproven destination item.");
        if (
          capability?.evidenceRef &&
          capability.evidenceRef.artifactId !== target.context.anchor.artifactId
        )
          throw new Error("The action capability belongs to different evidence.");
      }
      href = targetHref(target);
    }
  } catch (error) {
    reason = error instanceof Error ? error.message : reason;
  }
  if (!href || !target)
    return (
      <span data-evidence-unavailable aria-disabled="true" className="text-muted-foreground">
        <span>{children}</span>
        <span className="mt-1 block text-sm">{reason}</span>
      </span>
    );
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      openInNewTab
    )
      return;
    event.preventDefault();
    openTarget(target);
  };
  return (
    <a
      href={href}
      onClick={follow}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener" : undefined}
      className={className}
      title={capability?.reason}
      data-evidence-link={purpose === "evidence" ? true : undefined}
      data-relation={purpose === "evidence" ? target.relation?.relation : undefined}
    >
      {children}
      {capability && <span className="ml-2 text-[11px]">{capability.label}</span>}
    </a>
  );
}
