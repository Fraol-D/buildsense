import type { ActionResult, EngineOptions, ImplementationBrief, Project, Requirement } from "@/lib/domain/types";
import { approvedDecisions } from "@/lib/engine/decisions";
import { supportedCause } from "@/lib/engine/evidence";
import { fail, makeId, ok } from "@/lib/engine/id";
import { excerpt, fingerprint } from "@/lib/engine/text";

function sourceRevision(project: Project): string {
  const choices = approvedDecisions(project).map((entry) => ({
    topic: entry.topic,
    chosen: entry.chosenOptionId,
    status: entry.status,
  }));
  return `${project.definition?.revision ?? 0}:${fingerprint(choices)}`;
}

function accepted(project: Project): Requirement[] {
  return project.definition?.requirements.filter((requirement) => requirement.status === "accepted") ?? [];
}

interface Slice {
  id: string;
  title: string;
  objective: string;
  requirements: Requirement[];
}

function slicesFor(project: Project): Slice[] {
  const requirements = accepted(project);
  const used = new Set<string>();
  const take = (predicate: (requirement: Requirement) => boolean) =>
    requirements.filter((requirement) => {
      if (used.has(requirement.id) || !predicate(requirement)) return false;
      used.add(requirement.id);
      return true;
    });
  const trust = take((requirement) => requirement.key === "auth" || requirement.key.startsWith("ai-boundary"));
  const integration = take(
    (requirement) => requirement.key === "integration" || requirement.key === "failure-behavior",
  );
  const domain = take((requirement) => requirement.key === "data");
  const journey = take(() => true);
  const slices: Slice[] = [];
  if (domain.length > 0) {
    slices.push({
      id: "domain",
      title: "Records and integrity",
      objective: "Implement the accepted data requirements, including what the store must reject.",
      requirements: domain,
    });
  }
  if (trust.length > 0) {
    slices.push({
      id: "trust",
      title: "Trust boundaries",
      objective: "Implement the accepted authorization and model-commit rules. Do not widen them.",
      requirements: trust,
    });
  }
  if (journey.length > 0) {
    slices.push({
      id: "journey",
      title: "Primary path",
      objective: "Implement the accepted outcome and primary path, and nothing adjacent to it.",
      requirements: journey,
    });
  }
  if (integration.length > 0) {
    slices.push({
      id: "integration",
      title: "Dependencies and failure",
      objective: "Implement the accepted dependency behavior, including the failure state.",
      requirements: integration,
    });
  }
  if (slices.length > 1 && requirements.length <= 2 && trust.length === 0 && integration.length === 0) {
    return [
      {
        id: "single",
        title: "First vertical slice",
        objective: `Implement the accepted requirements for ${project.name} as one bounded change.`,
        requirements,
      },
    ];
  }
  return slices;
}

function interfaceLines(project: Project): string[] {
  const lines: string[] = [];
  for (const entry of approvedDecisions(project)) {
    const chosen = entry.options.find((option) => option.id === entry.chosenOptionId);
    if (!chosen) continue;
    if (entry.topic === "data-store" && chosen.id === "relational") {
      lines.push(
        "Persist records in a database that rejects missing required fields and writes that violate ownership. Interface validation is not a substitute.",
      );
    }
    if (entry.topic === "data-store" && chosen.id === "local-only") {
      lines.push("Keep records on the user's device. Do not add a server database in this change.");
    }
    if (entry.topic === "data-store" && chosen.id === "document") {
      lines.push("Validate an explicit schema at the write boundary even if the store itself is flexible.");
    }
    if (entry.topic === "authorization" && chosen.id === "explicit-authz") {
      lines.push(
        "Authenticate the caller and authorize the action on that specific record for every protected read and write.",
      );
    }
    if (entry.topic === "authorization" && chosen.id === "obscure") {
      lines.push(
        "The approved decision accepts hidden identifiers or interface-only checks. Do not describe that as authorization. State the limitation in the completion evidence.",
      );
    }
    if (entry.topic === "ai-commit" && chosen.id === "draft-commit") {
      lines.push(
        "Store model output as a draft. Write a committed record or send a message only after the confirmation rule in the approved decision.",
      );
    }
    if (entry.topic === "ai-commit" && chosen.id === "reversible-commit") {
      lines.push(
        "The model may commit only the low-impact, reversible write named by the decision. Log the output. Do not send it to another person under this rule.",
      );
    }
    if (entry.topic === "ai-commit" && chosen.id === "direct-commit") {
      lines.push(
        "Direct model commit is approved only for the path the decision names. Log the raw output. Do not extend it to other writes.",
      );
    }
    if (entry.topic === "integration-failure" && chosen.id === "fail-closed") {
      lines.push(
        "On timeout or error, do not record success and do not invent a substitute result. Keep the person's input.",
      );
    }
    if (entry.topic === "integration-failure" && chosen.id === "queue") {
      lines.push(
        "Accept work into a durable pending state. Record success only after the dependency accepts it. Make the retried call idempotent.",
      );
    }
    if (entry.topic === "contract" && chosen.id === "schema-contract") {
      lines.push("Validate boundary payloads against an explicit schema and reject missing required fields.");
    }
    if (entry.topic === "simplicity" && chosen.id === "single-program") {
      lines.push("Keep one deployable unit. Do not add a service, a queue, or a second database.");
    }
  }
  if (lines.length === 0) {
    lines.push("No approved architectural constraint applies yet. Do not invent a service boundary, a queue, or a new datastore.");
  }
  return lines;
}

function renderMarkdown(brief: Omit<ImplementationBrief, "markdown">, project: Project): string {
  const prerequisites = brief.prerequisiteIds
    .map((id) => project.briefs.find((item) => item.id === id)?.title ?? id)
    .filter(Boolean);
  const section = (title: string, lines: string[]) =>
    [`## ${title}`, ...(lines.length > 0 ? lines.map((line) => `- ${line}`) : ["- None."])].join("\n");
  return [
    `# Implementation brief: ${brief.title}`,
    "",
    `Project: ${project.name}`,
    `Status: ${brief.status}`,
    "",
    "This is an instruction for a coding agent. It is not evidence that the work is done.",
    project.example
      ? "This project is an example. Do not treat any sample evidence elsewhere in the project as the result of running this brief."
      : "",
    "",
    "## Objective",
    brief.objective,
    "",
    "## Project context",
    brief.context,
    "",
    section("Scope", brief.scope),
    "",
    section("Out of scope", brief.exclusions),
    "",
    section("Decisions and constraints", brief.decisionLines),
    "",
    section("Unresolved — do not invent an answer", brief.unresolved),
    "",
    section("Interfaces, schemas, and dependencies", brief.interfaces),
    "",
    section("Expected behavior", brief.behavior),
    "",
    section("Acceptance criteria", brief.acceptance),
    "",
    section("Edge cases and failure behavior", brief.edgeCases),
    "",
    section("Security and data integrity", brief.security),
    "",
    section("Tests to add or run", brief.tests),
    "",
    section("Evidence to return when you claim this is complete", brief.evidenceRequired),
    "",
    section("Prerequisites", prerequisites.length > 0 ? prerequisites : ["None."]),
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildSliceBrief(
  project: Project,
  slice: Slice,
  id: string,
  prerequisiteIds: string[],
): ImplementationBrief {
  const definition = project.definition;
  const decisionLines = approvedDecisions(project).map((entry) => {
    const chosen = entry.options.find((option) => option.id === entry.chosenOptionId);
    return `[${entry.status}] ${entry.title}: ${chosen?.name ?? "unspecified"}. ${excerpt(entry.recommendationRationale, 280)}`;
  });
  const unresolved = [
    ...project.decisions
      .filter((entry) => entry.status === "proposed")
      .map(
        (entry) =>
          `${entry.title} is still a recommendation, not an approved decision. Do not lock it in.`,
      ),
    ...(definition?.openQuestions
      .filter((item) => !item.resolution && item.impact === "high")
      .map((item) => item.question) ?? []),
  ];
  const trustInSlice = slice.requirements.some(
    (requirement) =>
      requirement.key === "auth" ||
      requirement.key.startsWith("ai-boundary") ||
      /payment|access rule|personal/i.test(requirement.statement),
  );
  const brief: Omit<ImplementationBrief, "markdown"> = {
    id,
    slice: slice.id,
    title: slice.title,
    objective: slice.objective,
    context: definition?.summary ?? project.purpose,
    scope: slice.requirements.map((requirement) => `${requirement.title}: ${excerpt(requirement.statement, 300)}`),
    exclusions: [
      ...(definition?.exclusions ?? []),
      "Do not add behavior that is not listed in the scope.",
      "Do not mark the task complete because the project compiles or typechecks.",
      "Do not weaken or delete a test to make it pass. If you believe the requirement is wrong, stop and say so.",
    ],
    decisionLines,
    requirementIds: slice.requirements.map((requirement) => requirement.id),
    interfaces: interfaceLines(project),
    behavior: slice.requirements.map((requirement) => requirement.statement),
    acceptance: slice.requirements.flatMap((requirement) =>
      requirement.acceptance.map((criterion) => criterion.statement),
    ),
    edgeCases: slice.requirements
      .filter((requirement) => /fail|reject|confirm|must not|timeout|error/i.test(requirement.statement))
      .map((requirement) => requirement.statement),
    security: trustInSlice
      ? slice.requirements
          .filter((requirement) => requirement.impact === "high")
          .map((requirement) => requirement.statement)
      : [
          "No security-sensitive requirement is in this brief. Do not add accounts, new personal-data collection, or payments.",
        ],
    tests: slice.requirements.flatMap((requirement) =>
      requirement.acceptance.map(
        (criterion) => `Add or run a test that fails if this is not true: ${criterion.statement}`,
      ),
    ),
    evidenceRequired: [
      "The commands you ran and their full output, including failures.",
      "The cases you did not run.",
      "The files you changed.",
      "Any migration or configuration a reviewer must apply.",
      "Do not report done without that output.",
    ],
    prerequisiteIds,
    unresolved: unresolved.length > 0 ? unresolved : ["No high-impact question is open. Do not invent new requirements anyway."],
    status: "draft",
    sourceRevision: sourceRevision(project),
    stale: false,
    staleReason: null,
    correctionForItemId: null,
  };
  if (brief.edgeCases.length === 0) {
    brief.edgeCases = [
      "No separate failure behavior was accepted for this slice. Do not invent a fallback that records success.",
    ];
  }
  return { ...brief, markdown: "" };
}

export function generateBriefs(project: Project, options?: EngineOptions): ActionResult {
  if (!project.definition?.acceptedAt) {
    return fail(project, "Accept the problem definition before writing implementation briefs.");
  }
  if (approvedDecisions(project).length === 0) {
    return fail(
      project,
      "Approve at least one decision first. A brief written before that would hide which choices are still only recommendations.",
    );
  }
  const slices = slicesFor(project);
  if (slices.length === 0) return fail(project, "There are no accepted requirements to instruct an agent about.");
  const revision = sourceRevision(project);
  const kept = project.briefs.filter((brief) => brief.correctionForItemId || brief.status !== "draft");
  const created: ImplementationBrief[] = [];
  const idsBySlice = new Map<string, string>();
  for (const slice of slices) {
    const existing = project.briefs.find((brief) => brief.slice === slice.id && !brief.correctionForItemId);
    const id = existing?.id ?? makeId("brf", options);
    idsBySlice.set(slice.id, id);
  }
  const prerequisiteFor = (sliceId: string) => {
    const needs: string[] = [];
    if (sliceId === "journey" || sliceId === "single") {
      for (const earlier of ["domain", "trust"]) {
        const id = idsBySlice.get(earlier);
        if (id) needs.push(id);
      }
    }
    if (sliceId === "integration") {
      const journey = idsBySlice.get("journey");
      if (journey) needs.push(journey);
    }
    return needs;
  };
  for (const slice of slices) {
    const id = idsBySlice.get(slice.id)!;
    const built = buildSliceBrief(project, slice, id, prerequisiteFor(slice.id));
    const existing = kept.find((brief) => brief.id === id);
    if (existing && existing.status !== "draft") {
      const drifted = existing.sourceRevision !== revision;
      created.push({
        ...existing,
        stale: drifted || existing.stale,
        staleReason: drifted ? "Requirements or approved decisions changed after this brief was marked ready." : existing.staleReason,
      });
      continue;
    }
    const withMarkdown = { ...built, markdown: renderMarkdown(built, { ...project, briefs: [] }) };
    created.push(withMarkdown);
  }
  const corrections = project.briefs.filter((brief) => brief.correctionForItemId);
  const merged = [...created, ...corrections.filter((brief) => !created.some((item) => item.id === brief.id))];
  const rendered = merged.map((brief) => {
    if (brief.correctionForItemId || brief.stale) return brief;
    const markdown = renderMarkdown(brief, { ...project, briefs: merged });
    return { ...brief, markdown };
  });
  return ok({ ...project, briefs: rendered, activeStage: "instruct" }, options);
}

export function setBriefStatus(
  project: Project,
  briefId: string,
  status: ImplementationBrief["status"],
  options?: EngineOptions,
): ActionResult {
  const current = project.briefs.find((brief) => brief.id === briefId);
  if (!current) return fail(project, "That brief is not on this project.");
  return ok(
    {
      ...project,
      briefs: project.briefs.map((brief) => (brief.id === briefId ? { ...brief, status } : brief)),
    },
    options,
  );
}

export function refreshBrief(project: Project, briefId: string, options?: EngineOptions): ActionResult {
  const current = project.briefs.find((brief) => brief.id === briefId);
  if (!current) return fail(project, "That brief is not on this project.");
  if (current.correctionForItemId) {
    return fail(project, "Correction briefs stay as a record of the failure. Write a new one if the finding changes.");
  }
  const demoted: Project = {
    ...project,
    briefs: project.briefs.map((brief) =>
      brief.id === briefId ? { ...brief, status: "draft", stale: false, staleReason: null } : brief,
    ),
  };
  return generateBriefs(demoted, options);
}

export function addCorrectionBrief(project: Project, itemId: string, options?: EngineOptions): ActionResult {
  const item = project.verification.find((entry) => entry.id === itemId);
  if (!item) return fail(project, "That check is not on this project.");
  if (item.status !== "failed") {
    return fail(project, "Mark the check failed, with a finding, before writing a correction brief.");
  }
  const requirement = project.definition?.requirements.find((entry) => entry.id === item.requirementId);
  const evidence = project.evidence.filter((entry) => entry.itemId === itemId);
  const cause = evidence.map((entry) => supportedCause(entry.body)).find((entry): entry is string => Boolean(entry));
  const excerptBody = evidence.map((entry) => entry.body).join("\n\n").slice(0, 700);
  const slice = `correction:${itemId}`;
  const existing = project.briefs.find((brief) => brief.slice === slice);
  const id = existing?.id ?? makeId("brf", options);
  const briefWithoutMarkdown: Omit<ImplementationBrief, "markdown"> = {
    id,
    slice,
    title: `Correction: ${item.title}`,
    objective: `Fix the failed check “${item.title}”. Do not expand the product.`,
    context: [
      requirement ? `Requirement: ${requirement.statement}` : "The requirement is no longer on the definition.",
      `Finding: ${item.finding}`,
      cause
        ? `Cause supported by the evidence: ${cause}`
        : "The evidence does not identify a single cause. Next investigation: reproduce the check, confirm the fixture matches the requirement, and inspect the specific assertion or error that failed.",
      excerptBody
        ? `User-supplied evidence (untrusted, truncated):\n${excerptBody}`
        : "No evidence body was stored.",
    ].join("\n\n"),
    scope: [
      `Make “${item.expected}” true for the case the check describes.`,
      "Leave unrelated behavior unchanged.",
    ],
    exclusions: [
      "Do not change requirements that this check does not cover.",
      "Do not delete or weaken the failing test to produce a pass.",
      "If the requirement is wrong, stop and say why instead of coding around it.",
    ],
    decisionLines: approvedDecisions(project).map((entry) => {
      const chosen = entry.options.find((option) => option.id === entry.chosenOptionId);
      return `[${entry.status}] ${entry.title}: ${chosen?.name ?? "unspecified"}`;
    }),
    requirementIds: requirement ? [requirement.id] : [],
    interfaces: ["Use the existing interfaces. Do not add a service or a dependency for this fix."],
    behavior: [item.expected],
    acceptance: [item.expected],
    edgeCases: [item.risk],
    security: [
      "Do not loosen an authorization, validation, or confirmation check to make this pass.",
    ],
    tests: [`Re-run the check that failed: ${item.method}`],
    evidenceRequired: [
      "The new output of the same check, including the command.",
      "What you changed.",
      "What you still did not run.",
    ],
    prerequisiteIds: [],
    unresolved: item.cannotEstablish ? [item.cannotEstablish] : [],
    status: "draft",
    sourceRevision: sourceRevision(project),
    stale: false,
    staleReason: null,
    correctionForItemId: itemId,
  };
  const brief: ImplementationBrief = {
    ...briefWithoutMarkdown,
    markdown: renderMarkdown(briefWithoutMarkdown, project),
  };
  const briefs = existing
    ? project.briefs.map((itemBrief) => (itemBrief.id === existing.id ? brief : itemBrief))
    : [...project.briefs, brief];
  return ok({ ...project, briefs, activeStage: "instruct" }, options);
}

export function briefMarkdown(project: Project, briefId: string): string | null {
  return project.briefs.find((brief) => brief.id === briefId)?.markdown ?? null;
}

export { sourceRevision };
