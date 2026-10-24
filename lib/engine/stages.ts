import type { Project, Stage } from "@/lib/domain/types";
import { releaseReport } from "@/lib/engine/release";

export type StageMarker = "empty" | "started" | "done" | "attention";

export const STAGE_META: { id: Stage; index: string; label: string; purpose: string }[] = [
  {
    id: "discover",
    index: "01",
    label: "Discover",
    purpose: "Understand the problem before anyone writes code.",
  },
  {
    id: "define",
    index: "02",
    label: "Define",
    purpose: "Turn what was stated into requirements, and keep unknowns visible.",
  },
  {
    id: "decide",
    index: "03",
    label: "Decide",
    purpose: "Approve the choices that constrain the implementation.",
  },
  {
    id: "instruct",
    index: "04",
    label: "Instruct",
    purpose: "Write a bounded brief a coding agent can execute.",
  },
  {
    id: "verify",
    index: "05",
    label: "Verify",
    purpose: "Tie every important requirement to evidence, not to a claim.",
  },
  {
    id: "release",
    index: "06",
    label: "Release",
    purpose: "Decide whether the record justifies shipping.",
  },
];

export function stageMarkers(project: Project): Record<Stage, StageMarker> {
  const pictureReady = ["outcome", "users", "journey", "observable"].every((id) => project.interview.answers[id]);
  const report = releaseReport(project);
  return {
    discover: pictureReady ? "done" : project.interview.messages.length > 1 ? "started" : "empty",
    define: project.definition?.acceptedAt ? "done" : project.definition ? "started" : "empty",
    decide: project.decisions.some((item) => item.status !== "proposed")
      ? "done"
      : project.decisions.length > 0
        ? "started"
        : "empty",
    instruct: project.briefs.length > 0 ? "done" : "empty",
    verify:
      project.verification.some((item) => !item.orphaned && item.status === "failed")
        ? "attention"
        : project.verification.some((item) => !item.orphaned)
          ? "started"
          : "empty",
    release:
      report.recommendation === "not_justified"
        ? project.definition
          ? "attention"
          : "empty"
        : report.recommendation === "no_critical_gaps"
          ? "done"
          : "attention",
  };
}
