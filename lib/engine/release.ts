import type { Priority, Project, ReleaseRecommendation, VerificationItem } from "@/lib/domain/types";
import { approvedDecisions } from "@/lib/engine/decisions";
import { activeChecks } from "@/lib/engine/verification";

export interface ReleaseBlocker {
  itemId: string | null;
  title: string;
  status: string;
  detail: string;
}

export interface TraceCheck {
  id: string;
  title: string;
  priority: Priority;
  status: string;
  insufficient: boolean;
}

export interface TraceRow {
  requirementId: string;
  title: string;
  impact: string;
  origin: string;
  decisions: string[];
  briefs: string[];
  checks: TraceCheck[];
}

export interface ReleaseReport {
  recommendation: ReleaseRecommendation;
  headline: string;
  summary: string;
  counts: {
    verified: number;
    failed: number;
    unverified: number;
    blocked: number;
    criticalOpen: number;
    highOpen: number;
  };
  blockers: ReleaseBlocker[];
  overrides: { itemId: string; title: string }[];
  unknowns: string[];
  trace: TraceRow[];
  notEstablished: string[];
}

const HEADLINES: Record<ReleaseRecommendation, string> = {
  not_justified: "Do not ship on this record",
  critical_open: "Critical checks are still open",
  named_risks: "Critical checks are recorded. Named risks remain.",
  no_critical_gaps: "No critical gaps are on record",
};

function isOpen(item: VerificationItem): boolean {
  return item.status === "unverified" || item.status === "blocked";
}

function isSerious(item: VerificationItem): boolean {
  return item.priority === "critical" || item.priority === "high";
}

export function releaseReport(project: Project): ReleaseReport {
  const checks = activeChecks(project);
  const accepted = project.definition?.requirements.filter((requirement) => requirement.status === "accepted") ?? [];
  const counts = {
    verified: checks.filter((item) => item.status === "verified").length,
    failed: checks.filter((item) => item.status === "failed").length,
    unverified: checks.filter((item) => item.status === "unverified").length,
    blocked: checks.filter((item) => item.status === "blocked").length,
    criticalOpen: checks.filter((item) => item.priority === "critical" && (isOpen(item) || item.verifiedDespiteInsufficientEvidence)).length,
    highOpen: checks.filter((item) => item.priority === "high" && (isOpen(item) || item.verifiedDespiteInsufficientEvidence)).length,
  };
  const blockers: ReleaseBlocker[] = [];
  if (!project.definition?.acceptedAt) {
    blockers.push({
      itemId: null,
      title: "Problem definition",
      status: "unverified",
      detail: "The problem definition has not been accepted. There is no agreed set of requirements to release against.",
    });
  }
  for (const requirement of accepted) {
    const linked = checks.filter((item) => item.requirementId === requirement.id);
    if (linked.length === 0 && (requirement.impact === "high" || requirement.kind === "constraint")) {
      blockers.push({
        itemId: null,
        title: requirement.title,
        status: "unverified",
        detail: "This accepted requirement has no verification check. Generate a plan before treating it as covered.",
      });
    }
  }
  for (const item of checks) {
    if (item.status === "failed") {
      blockers.push({
        itemId: item.id,
        title: item.title,
        status: "failed",
        detail: item.finding || item.risk,
      });
    } else if (isSerious(item) && isOpen(item)) {
      blockers.push({
        itemId: item.id,
        title: item.title,
        status: item.status,
        detail: item.status === "blocked" ? item.finding || item.risk : item.risk,
      });
    } else if (isSerious(item) && item.verifiedDespiteInsufficientEvidence) {
      blockers.push({
        itemId: item.id,
        title: item.title,
        status: "verified without sufficient evidence",
        detail: "The status says verified. The evidence was appraised as insufficient, so this check stays open.",
      });
    }
  }
  const overrides = checks
    .filter((item) => item.verifiedDespiteInsufficientEvidence)
    .map((item) => ({ itemId: item.id, title: item.title }));
  const failed = checks.some((item) => item.status === "failed");
  const uncovered = accepted.filter((requirement) => !checks.some((item) => item.requirementId === requirement.id));
  const seriousOpen =
    counts.criticalOpen + counts.highOpen > 0 ||
    blockers.some((item) => item.status !== "failed") ||
    uncovered.some((requirement) => requirement.impact === "high");
  const lesserOpen =
    uncovered.length > 0 ||
    checks.some((item) => !isSerious(item) && (isOpen(item) || item.verifiedDespiteInsufficientEvidence));
  let recommendation: ReleaseRecommendation = "no_critical_gaps";
  if (!project.definition?.acceptedAt || failed) recommendation = "not_justified";
  else if (checks.length === 0 || seriousOpen) recommendation = "critical_open";
  else if (lesserOpen) recommendation = "named_risks";

  const unknowns = [
    ...(project.definition?.openQuestions.filter((item) => !item.resolution).map((item) => item.question) ?? []),
    ...project.decisions
      .filter((item) => item.status === "proposed")
      .map((item) => `${item.title} is still only a recommendation.`),
    ...project.decisions
      .filter((item) => item.needsReview)
      .map((item) => item.reviewReason || `${item.title} needs another look.`),
  ];

  const trace: TraceRow[] = accepted.map((requirement) => ({
    requirementId: requirement.id,
    title: requirement.title,
    impact: requirement.impact,
    origin: requirement.origin,
    decisions: approvedDecisions(project)
      .filter((entry) => relates(entry.topic, requirement))
      .map((entry) => entry.title),
    briefs: project.briefs
      .filter((brief) => brief.requirementIds.includes(requirement.id))
      .map((brief) => brief.title),
    checks: checks
      .filter((item) => item.requirementId === requirement.id)
      .map((item) => ({
        id: item.id,
        title: item.title,
        priority: item.priority,
        status: item.status,
        insufficient: item.verifiedDespiteInsufficientEvidence,
      })),
  }));

  const notEstablished = [
    "Buildsense did not run the tests, read the repository, or inspect a deployment.",
    "A coding agent's claim that the work is done is not recorded here as evidence unless you pasted the output.",
    "Checks that were never written are not covered by a quiet absence.",
    ...checks.map((item) => item.cannotEstablish).filter((value, index, all) => all.indexOf(value) === index).slice(0, 6),
  ];
  if (project.example) {
    notEstablished.unshift(
      "This is the Meri example. Every piece of evidence in it was written as an illustration. None of it was produced by running tests.",
    );
  }

  const summaryParts = [HEADLINES[recommendation] + "."];
  if (project.example) {
    summaryParts.push(
      "Meri is a labeled example, built to show the workflow. Its evidence is illustrative and must not be read as a test run.",
    );
  }
  if (!project.definition?.acceptedAt) {
    summaryParts.push("There is no accepted problem definition, so there is nothing honest to call a release.");
  } else if (checks.length === 0) {
    summaryParts.push("No verification plan has been generated. Accepted requirements are uncovered.");
  } else if (failed) {
    summaryParts.push(
      `${counts.failed} check${counts.failed === 1 ? "" : "s"} failed. A failure is a reason to correct the implementation or to change the requirement in the open. It is not a reason to ship.`,
    );
  } else if (recommendation === "critical_open") {
    summaryParts.push(
      `${counts.criticalOpen} critical and ${counts.highOpen} high-impact checks are open, blocked, or marked verified without sufficient evidence. High-impact requirements without a check are included in the gaps below.`,
    );
  } else if (recommendation === "named_risks") {
    summaryParts.push(
      "Nothing critical or high-impact is failed or empty, and the remaining open checks are lower priority. They are still unknown. This is not a certification.",
    );
  } else {
    summaryParts.push(
      "Every accepted requirement in this plan has a check you marked verified, and none of those marks overrode an insufficient appraisal. That means the recorded plan has no critical gap. It does not mean the product is safe beyond what those checks observed.",
    );
  }
  if (unknowns.length > 0) {
    summaryParts.push(`${unknowns.length} named unknown${unknowns.length === 1 ? "" : "s"} remain on the record.`);
  }
  summaryParts.push("Buildsense did not execute the checks.");

  return {
    recommendation,
    headline: HEADLINES[recommendation],
    summary: summaryParts.join(" "),
    counts,
    blockers,
    overrides,
    unknowns,
    trace,
    notEstablished,
  };
}

function relates(topic: string, requirement: { key: string; statement: string }): boolean {
  if (topic === "ai-commit") return requirement.key.startsWith("ai-boundary");
  if (topic === "authorization") return requirement.key === "auth" || /access|owner|unauthor/i.test(requirement.statement);
  if (topic === "data-store") return requirement.key === "data";
  if (topic === "integration-failure") return requirement.key === "integration" || requirement.key === "failure-behavior";
  if (topic === "contract") return requirement.key === "integration" || requirement.key === "data";
  return false;
}

export function recommendationLabel(recommendation: ReleaseRecommendation): string {
  return HEADLINES[recommendation];
}
