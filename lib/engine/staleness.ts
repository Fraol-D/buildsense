import type { EngineOptions, Project, Requirement } from "@/lib/domain/types";
import { nowIso } from "@/lib/engine/id";
import { fingerprint } from "@/lib/engine/text";

export function requirementFingerprint(requirement: Pick<Requirement, "statement" | "acceptance">): string {
  return fingerprint({
    statement: requirement.statement,
    acceptance: requirement.acceptance.map((criterion) => criterion.statement),
  });
}

export function markChecksForRequirement(
  project: Project,
  requirementId: string,
  nextFingerprint: string,
  options?: EngineOptions,
): Project {
  const at = nowIso(options);
  return {
    ...project,
    verification: project.verification.map((item) => {
      if (item.requirementId !== requirementId || item.orphaned) return item;
      if (item.statementFingerprint === nextFingerprint) return item;
      const lostVerdict = item.status === "verified" || item.status === "failed";
      return {
        ...item,
        statementFingerprint: nextFingerprint,
        needsReview: true,
        reviewNote: "The requirement changed after this check was recorded.",
        status: lostVerdict ? "unverified" : item.status,
        verifiedDespiteInsufficientEvidence: lostVerdict ? false : item.verifiedDespiteInsufficientEvidence,
        history: lostVerdict
          ? [
              ...item.history,
              {
                at,
                status: "unverified" as const,
                note: "Returned to unverified because the requirement changed after evidence was recorded.",
              },
            ]
          : item.history,
      };
    }),
  };
}

export function orphanChecksForRequirement(project: Project, requirementId: string, orphaned: boolean): Project {
  return {
    ...project,
    verification: project.verification.map((item) =>
      item.requirementId === requirementId ? { ...item, orphaned } : item,
    ),
  };
}

export function markBriefsStale(project: Project, reason: string): Project {
  return {
    ...project,
    briefs: project.briefs.map((brief) =>
      brief.correctionForItemId
        ? brief
        : {
            ...brief,
            stale: true,
            staleReason: reason,
          },
    ),
  };
}
