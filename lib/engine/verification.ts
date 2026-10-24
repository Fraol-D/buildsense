import type {
  ActionResult,
  EngineOptions,
  Evidence,
  EvidenceKind,
  Priority,
  Project,
  Requirement,
  VerificationItem,
  VerificationStatus,
} from "@/lib/domain/types";
import { appraiseEvidence } from "@/lib/engine/evidence";
import { fail, makeId, nowIso, ok } from "@/lib/engine/id";
import { addLesson } from "@/lib/engine/lessons";
import { requirementFingerprint } from "@/lib/engine/staleness";

interface CheckSpec {
  suffix: string;
  title: string;
  risk: string;
  whyItMatters: string;
  method: string;
  expected: string;
  successEvidence: string;
  cannotEstablish: string;
  priority: Priority;
  priorityReason: string;
}

function acceptedRequirements(project: Project): Requirement[] {
  return project.definition?.requirements.filter((requirement) => requirement.status === "accepted") ?? [];
}

function specsFor(requirement: Requirement): CheckSpec[] {
  const expected =
    requirement.acceptance.map((criterion) => criterion.statement).join(" ") || requirement.statement;
  const sensitive =
    requirement.impact === "high" &&
    /auth|access|owner|model|confirm|payment|fail|reject|permission|transcript|personal/i.test(
      `${requirement.key} ${requirement.title} ${requirement.statement}`,
    );
  const priority: Priority = sensitive ? "critical" : requirement.impact === "high" ? "high" : requirement.impact;
  const specs: CheckSpec[] = [
    {
      suffix: "behavior",
      title: requirement.title,
      risk: "The implementation skips this behavior, or only the happy path resembles it.",
      whyItMatters: requirement.why,
      method:
        "Exercise the acceptance criteria with a realistic input. Record the command, the input, and the full output.",
      expected,
      successEvidence:
        "Output that shows the input used and the observation named in the acceptance criteria. A passing name with no output does not count.",
      cannotEstablish:
        "A successful compile, a typecheck, a screenshot of an empty form, or an agent's statement that the feature is done cannot establish this.",
      priority,
      priorityReason: sensitive
        ? "High-impact behavior that can expose data, commit model output, take payment, or hide a failure."
        : `Matches the requirement impact (${requirement.impact}).`,
    },
  ];

  if (requirement.key === "auth" || /access rule|unable to|must not|unauthorized|another person/i.test(requirement.statement)) {
    specs.push({
      suffix: "wrong-actor",
      title: `${requirement.title}: wrong actor`,
      risk: "The owner path works, and a second identity can still read or change the record.",
      whyItMatters: "Authorization bugs hide on the happy path of the rightful owner.",
      method:
        "Repeat the protected action as a different identity that must not have access. Use a real identifier for the other person's record, not an empty account.",
      expected: "The second identity is rejected, and the protected record is unchanged.",
      successEvidence:
        "Output showing the second identity, the rejection, and a read-back that the record did not change.",
      cannotEstablish: "A test that only uses the owner's session cannot establish the boundary.",
      priority: "critical",
      priorityReason: "A missing authorization check exposes or mutates someone else's data.",
    });
  }

  if (requirement.key.startsWith("ai-boundary")) {
    specs.push({
      suffix: "malformed-model",
      title: `${requirement.title}: unconfirmed model output`,
      risk: "A malformed, empty, or unconfirmed model response is stored or sent as a committed result.",
      whyItMatters: "The model is not the source of truth. The commit rule is.",
      method:
        "Feed the boundary a malformed response and a plausible but unconfirmed response. Inspect the committed store and any outbound message.",
      expected: "Neither response becomes a committed record or an outbound message.",
      successEvidence:
        "Output showing the model payload used and a read-back of the committed state and outbound side effects.",
      cannotEstablish:
        "A unit test that mocks the model and never inspects the committed record cannot establish the boundary.",
      priority: "critical",
      priorityReason: "Unconfirmed model output can change stored truth or reach another person.",
    });
  }

  if (requirement.key === "integration" || requirement.key === "failure-behavior" || requirement.key === "payment-failure-proposal") {
    specs.push({
      suffix: "dependency-down",
      title: `${requirement.title}: dependency failure`,
      risk: "A timeout, error, or unexpected payload is recorded as success or replaced with a guess.",
      whyItMatters: "False success is a data-integrity bug, not a cosmetic error state.",
      method:
        "Force the dependency to time out and to return an error. Inspect what was saved and what was sent.",
      expected: "No success state is stored or sent. The person's input is still available to retry.",
      successEvidence: "Output showing the forced failure and the stored state afterwards.",
      cannotEstablish: "A test that stubs the dependency as successful cannot establish the failure path.",
      priority: "critical",
      priorityReason: "Dependency failure can persist a lie about what happened.",
    });
  }

  if (requirement.key === "data") {
    specs.push({
      suffix: "reject-invalid",
      title: `${requirement.title}: invalid write`,
      risk: "The interface blocks a bad form, and another writer still persists a partial or unauthorized record.",
      whyItMatters: "Integrity has to hold at the store, not only in one form.",
      method:
        "Bypass the interface and attempt a write with a missing required field and a write for a record the caller does not own.",
      expected: "The store rejects both writes.",
      successEvidence: "Output from the rejected writes and a read-back showing the records were not created or changed.",
      cannotEstablish: "Client-side validation alone cannot establish this.",
      priority: requirement.impact === "high" ? "critical" : "high",
      priorityReason: "A bad write that the database accepts becomes the source of truth.",
    });
  }

  return specs;
}

function itemFromSpec(
  project: Project,
  requirement: Requirement,
  spec: CheckSpec,
  options?: EngineOptions,
): VerificationItem {
  return {
    id: makeId("chk", options),
    key: `${requirement.key}:${spec.suffix}`,
    requirementId: requirement.id,
    title: spec.title,
    risk: spec.risk,
    whyItMatters: spec.whyItMatters,
    method: spec.method,
    expected: spec.expected,
    successEvidence: spec.successEvidence,
    cannotEstablish: spec.cannotEstablish,
    priority: spec.priority,
    priorityReason: spec.priorityReason,
    status: "unverified",
    finding: "",
    needsReview: false,
    reviewNote: null,
    orphaned: false,
    verifiedDespiteInsufficientEvidence: false,
    statementFingerprint: requirementFingerprint(requirement),
    history: [],
  };
}

export function generateVerification(project: Project, options?: EngineOptions): ActionResult {
  if (!project.definition?.acceptedAt) {
    return fail(project, "Accept the problem definition before building a verification plan.");
  }
  const requirements = acceptedRequirements(project);
  if (requirements.length === 0) {
    return fail(project, "There are no accepted requirements to verify.");
  }
  const nextItems: VerificationItem[] = [];
  for (const requirement of requirements) {
    for (const spec of specsFor(requirement)) {
      const key = `${requirement.key}:${spec.suffix}`;
      const existing = project.verification.find((item) => item.key === key);
      const built = itemFromSpec(project, requirement, spec, options);
      if (!existing) {
        nextItems.push(built);
        continue;
      }
      const sameText = existing.statementFingerprint === built.statementFingerprint;
      nextItems.push({
        ...built,
        id: existing.id,
        status: sameText ? existing.status : existing.status === "blocked" ? "blocked" : "unverified",
        finding: sameText ? existing.finding : existing.finding,
        needsReview: sameText ? existing.needsReview : true,
        reviewNote: sameText ? existing.reviewNote : "The requirement changed after this check was recorded.",
        verifiedDespiteInsufficientEvidence: sameText ? existing.verifiedDespiteInsufficientEvidence : false,
        history: sameText
          ? existing.history
          : [
              ...existing.history,
              {
                at: nowIso(options),
                status: "unverified" as const,
                note: "Requirement text changed. A previous verified or failed status was not carried forward.",
              },
            ],
      });
    }
  }
  for (const existing of project.verification) {
    if (!nextItems.some((item) => item.id === existing.id)) {
      nextItems.push({ ...existing, orphaned: true });
    }
  }
  const priorityOrder: Priority[] = ["critical", "high", "medium", "low"];
  nextItems.sort((left, right) => priorityOrder.indexOf(left.priority) - priorityOrder.indexOf(right.priority));
  return ok({ ...project, verification: nextItems, activeStage: "verify" }, options);
}

export function addEvidence(
  project: Project,
  input: { itemId: string; kind: EvidenceKind; body: string; note: string },
  options?: EngineOptions,
): ActionResult {
  const item = project.verification.find((entry) => entry.id === input.itemId);
  if (!item) return fail(project, "That check is not on this project.");
  const body = input.body.trim();
  if (!body) return fail(project, "Paste the evidence. An empty note cannot support a status.");
  const evidence: Evidence = {
    id: makeId("ev", options),
    itemId: input.itemId,
    kind: input.kind,
    body,
    note: input.note.trim(),
    submittedAt: nowIso(options),
    illustrative: Boolean(options?.illustrativeEvidence),
    appraisal: appraiseEvidence(body, item),
  };
  return ok({ ...project, evidence: [...project.evidence, evidence] }, options);
}

export function setVerificationStatus(
  project: Project,
  itemId: string,
  status: VerificationStatus,
  input: { finding?: string; acknowledgeInsufficient?: boolean },
  options?: EngineOptions,
): ActionResult {
  const item = project.verification.find((entry) => entry.id === itemId);
  if (!item) return fail(project, "That check is not on this project.");
  const finding = input.finding?.trim() ?? "";
  const evidence = project.evidence.filter((entry) => entry.itemId === itemId);
  if (status === "verified" && evidence.length === 0) {
    return fail(
      project,
      "Record evidence before marking this verified. A status with no evidence is an unverified claim.",
    );
  }
  const insufficient = evidence.length > 0 && evidence.every((entry) => entry.appraisal.label === "insufficient");
  if (status === "verified" && insufficient && !input.acknowledgeInsufficient) {
    return fail(
      project,
      "The evidence on record was appraised as insufficient. You can still mark it verified only by acknowledging that the status is ahead of the evidence.",
    );
  }
  if ((status === "failed" || status === "blocked") && !finding) {
    return fail(
      project,
      status === "failed"
        ? "Describe what the evidence shows is wrong."
        : "Say what is blocking this check.",
    );
  }
  const override = status === "verified" && insufficient;
  let next: Project = {
    ...project,
    verification: project.verification.map((entry) =>
      entry.id === itemId
        ? {
            ...entry,
            status,
            finding,
            needsReview: false,
            verifiedDespiteInsufficientEvidence: override,
            history: [
              ...entry.history,
              {
                at: nowIso(options),
                status,
                note: override
                  ? "Marked verified even though the evidence was appraised as insufficient."
                  : finding || "Status set from the recorded evidence.",
              },
            ],
          }
        : entry,
    ),
  };
  if (override) {
    next = addLesson(
      next,
      {
        key: `verify-override:${itemId}`,
        title: "A confident status is not evidence",
        context: item.title,
        explanation:
          "You marked this check verified while every piece of evidence on it was appraised as insufficient. The status is recorded, and so is the fact that the evidence does not support it. Release readiness will not treat this as a closed critical check.",
        principle:
          "Activity, a green compile, and a summary that says the work is done are not the same as an observation of the required behavior.",
        deeper:
          "Coding agents are rewarded for finishing. They will often report success after the code compiles. An engineer asks what was exercised, what the output was, and which cases were not run. That question is the whole difference between a generated diff and a result you can defend.",
      },
      options,
    );
  }
  if (status === "failed") {
    const requirement = project.definition?.requirements.find((entry) => entry.id === item.requirementId);
    next = addLesson(
      next,
      {
        key: `verify-failed:${itemId}`,
        title: "A failed check is information about the system",
        context: `${item.title}. Finding: ${finding}`,
        explanation: `The evidence says this check failed. The requirement${requirement ? ` “${requirement.title}”` : ""} still stands until you change it on purpose. The next move is a focused correction, not a quieter test and not a claim that the feature is close enough.`,
        principle:
          "Read the evidence before rewriting the design. Fix the implementation when the requirement still holds. Change the requirement only when the evidence shows the requirement itself was wrong.",
        deeper:
          "Under schedule pressure it is tempting to reclassify a failure as an edge case. Do that only by editing the requirement, the acceptance criterion, and the check together, in the open. Otherwise the release story describes a product the code does not implement.",
      },
      options,
    );
  }
  return ok({ ...next, activeStage: "verify" }, options);
}

export function activeChecks(project: Project): VerificationItem[] {
  return project.verification.filter((item) => !item.orphaned);
}

export function checksForRequirement(project: Project, requirementId: string): VerificationItem[] {
  return activeChecks(project).filter((item) => item.requirementId === requirementId);
}
