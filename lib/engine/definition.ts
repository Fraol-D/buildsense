import type {
  ActionResult,
  Assumption,
  EngineOptions,
  Impact,
  OpenQuestion,
  ProblemDefinition,
  Project,
  Requirement,
  RequirementKind,
  RequirementStatus,
} from "@/lib/domain/types";
import { collectFacts, type Facts } from "@/lib/engine/facts";
import { fail, makeId, nowIso, ok } from "@/lib/engine/id";
import { addLesson } from "@/lib/engine/lessons";
import { DRAFT_QUESTION_IDS } from "@/lib/engine/questions";
import {
  markBriefsStale,
  markChecksForRequirement,
  orphanChecksForRequirement,
  requirementFingerprint,
} from "@/lib/engine/staleness";
import {
  defersTrust,
  excerpt,
  hasAccessLanguage,
  isPreference,
  isUnknownAnswer,
  mentionsObligation,
  splitLines,
} from "@/lib/engine/text";

const MISSING_LABELS: Record<(typeof DRAFT_QUESTION_IDS)[number], string> = {
  outcome: "what the software must accomplish",
  users: "who it is for",
  journey: "the primary path",
  observable: "an observable success check",
};

function question(
  options: EngineOptions | undefined,
  text: string,
  impact: Impact,
  consequence: string,
): OpenQuestion {
  return {
    id: makeId("oq", options),
    question: text,
    impact,
    consequence,
    resolution: null,
  };
}

function criterion(options: EngineOptions | undefined, statement: string) {
  return { id: makeId("ac", options), statement };
}

function statedRequirement(
  options: EngineOptions | undefined,
  input: {
    key: string;
    title: string;
    statement: string;
    kind: RequirementKind;
    impact: Impact;
    why: string;
    acceptance: string[];
  },
): Requirement {
  return {
    id: makeId("req", options),
    key: input.key,
    title: input.title,
    statement: input.statement,
    kind: input.kind,
    impact: input.impact,
    origin: "stated",
    status: "proposed",
    acceptance: input.acceptance.map((statement) => criterion(options, statement)),
    why: input.why,
  };
}

function buildDraft(project: Project, options?: EngineOptions): ProblemDefinition {
  const facts = collectFacts(project);
  const requirements: Requirement[] = [];
  const openQuestions: OpenQuestion[] = [];
  const assumptions: Assumption[] = [];
  const constraints: string[] = [];
  const exclusions: string[] = [];
  const contextNotes: string[] = [];

  const pushAssumption = (statement: string, consequence: string, origin: Assumption["origin"] = "inferred") => {
    assumptions.push({
      id: makeId("asm", options),
      statement,
      consequence,
      status: "unreviewed",
      origin,
    });
  };

  if (!facts.outcome) {
    openQuestions.push(
      question(
        options,
        "What concrete outcome must the software deliver?",
        "high",
        "Without an outcome, every later decision and brief is aimed at a guess.",
      ),
    );
  } else {
    requirements.push(
      statedRequirement(options, {
        key: "outcome",
        title: "Deliver the stated outcome",
        statement: facts.outcome,
        kind: "functional",
        impact: "high",
        why: "This is the outcome you stated.",
        acceptance: facts.observable ? [facts.observable] : [],
      }),
    );
    if (!facts.observable) {
      openQuestions.push(
        question(
          options,
          "What observation would show that the outcome happened?",
          "high",
          "A requirement without an observation cannot be verified. A compile or a demo is not that observation.",
        ),
      );
    }
  }

  if (!facts.users) {
    openQuestions.push(
      question(
        options,
        "Who is this for, in a specific situation?",
        "high",
        "Authorization, data ownership, and the primary path depend on the answer.",
      ),
    );
  }

  const steps = facts.steps.filter((step) => step.length > 40 && mentionsObligation(step)).slice(0, 3);
  if (steps.length >= 2) {
    steps.forEach((step, index) => {
      requirements.push(
        statedRequirement(options, {
          key: `journey-${index + 1}`,
          title: `Primary path, step ${index + 1}`,
          statement: step,
          kind: "functional",
          impact: index === steps.length - 1 ? "high" : "medium",
          why: "This step comes from the path you described.",
          acceptance: [`This step can be observed as described: ${excerpt(step, 220)}`],
        }),
      );
    });
  } else if (facts.journey) {
    requirements.push(
      statedRequirement(options, {
        key: "journey",
        title: "Complete the primary path",
        statement: facts.journey,
        kind: "functional",
        impact: "high",
        why: "This is the path you described.",
        acceptance: [
          facts.observable
            ? `Following this path produces the observation: ${facts.observable}`
            : `The path can be followed as described: ${excerpt(facts.journey, 220)}`,
        ],
      }),
    );
  } else {
    openQuestions.push(
      question(
        options,
        "What is the ordered primary path from start to the outcome?",
        "high",
        "Without a path, an implementation brief has no bounded behavior to ask for.",
      ),
    );
  }
  if (facts.journey) {
    facts.steps.forEach((step) => {
      if (!requirements.some((requirement) => requirement.statement === step) && step.length > 20) {
        contextNotes.push(`Path detail kept as context, not split into its own requirement: ${excerpt(step, 240)}`);
      }
    });
  }

  if (facts.signals.deniesStorage) {
    constraints.push("The first version does not persist data beyond the session.");
  } else if (facts.data && (hasAccessLanguage(facts.data) || (facts.auth && !defersTrust(facts.auth)))) {
    requirements.push(
      statedRequirement(options, {
        key: "data",
        title: "Remember only the stated records, under the stated access rule",
        statement: facts.auth ? `${facts.data} Access rule: ${facts.auth}` : facts.data,
        kind: "functional",
        impact: facts.signals.sensitiveData || facts.signals.multiUser ? "high" : "medium",
        why: "You described both the records and a rule for who may use them.",
        acceptance: [
          "A record described here is still available after a new session.",
          "An actor outside the stated access rule cannot read or change it.",
        ],
      }),
    );
  } else if (facts.data) {
    contextNotes.push(`Described data, not yet a requirement because access is unsettled: ${facts.data}`);
    openQuestions.push(
      question(
        options,
        "Who may read and change the data you described, and what must be rejected?",
        "high",
        "Storing the data without an access rule lets an implementation invent who is allowed to see it.",
      ),
    );
  } else if (project.interview.answers.data && isUnknownAnswer(project.interview.answers.data)) {
    openQuestions.push(
      question(
        options,
        "What, if anything, must the software remember after the session ends, and who may read it?",
        "high",
        "The choice between storing nothing, storing it on the device, and storing it under an access rule changes the design.",
      ),
    );
  }

  if (facts.signals.deniesIntegrations) {
    constraints.push("The first version does not call an external service.");
  } else if (facts.integrations && facts.failures) {
    requirements.push(
      statedRequirement(options, {
        key: "integration",
        title: "Use the named dependency, including when it fails",
        statement: `Dependency: ${facts.integrations} Failure behavior: ${facts.failures}`,
        kind: "functional",
        impact: "high",
        why: "You named both the dependency and what must happen when it fails.",
        acceptance: [
          "The stated exchange with the dependency happens on the success path.",
          "When the dependency fails, the product does not record or send a success it did not receive.",
        ],
      }),
    );
  } else if (facts.integrations) {
    contextNotes.push(`Named dependency, without a failure rule: ${facts.integrations}`);
    openQuestions.push(
      question(
        options,
        `What must not be saved or sent when ${excerpt(facts.integrations, 80)} fails or returns a wrong result?`,
        "high",
        "Without a failure rule, an implementation can record success for a call that did not succeed.",
      ),
    );
  } else if (facts.signals.externalServices) {
    openQuestions.push(
      question(
        options,
        "Which external services are actually in the first version?",
        "medium",
        "Signals in the interview mention an integration that was not named as a requirement.",
      ),
    );
  }

  if (facts.auth && !defersTrust(facts.auth)) {
    const alreadyInData = requirements.some((requirement) => requirement.key === "data" && requirement.statement.includes(facts.auth ?? ""));
    if (!alreadyInData) {
      requirements.push(
        statedRequirement(options, {
          key: "auth",
          title: "Enforce the stated identity and authorization rule",
          statement: facts.auth,
          kind: "constraint",
          impact: "high",
          why: "You stated an authorization rule.",
          acceptance: [
            "A permitted actor can complete the action.",
            "An actor who lacks the stated right is rejected, and the protected record does not change.",
          ],
        }),
      );
    }
  } else if (
    facts.signals.multiUser ||
    facts.signals.sensitiveData ||
    facts.signals.payments ||
    facts.signals.regulated
  ) {
    openQuestions.push(
      question(
        options,
        "What must one person be unable to do with another person's data in the first version?",
        "high",
        "This project describes shared or sensitive data. Leaving authorization unstated lets the implementation skip the check.",
      ),
    );
  }

  if (facts.ai) {
    requirements.push(
      statedRequirement(options, {
        key: "ai-boundary",
        title: "Keep model output inside the boundary you stated",
        statement: facts.ai,
        kind: "constraint",
        impact: "high",
        why: "You stated what a model may do and what must be confirmed.",
        acceptance: [
          "Unconfirmed model output is not stored or sent as a committed result.",
          "A malformed or off-boundary model response does not change the committed record.",
        ],
      }),
    );
  } else if (facts.signals.usesAI) {
    openQuestions.push(
      question(
        options,
        "What must a person or a deterministic check confirm before model output changes stored data or reaches someone else?",
        "high",
        "If this stays open, a coding agent can treat model output as the committed result.",
      ),
    );
    requirements.push({
      id: makeId("req", options),
      key: "ai-boundary-proposal",
      title: "Proposal: confirm model output before it commits",
      statement:
        "Model output stays a draft. A person or a deterministic check confirms it before it is stored as a committed result or sent to someone else.",
      kind: "constraint",
      impact: "high",
      origin: "inferred",
      status: "proposed",
      acceptance: [
        criterion(
          options,
          "A model response that was not confirmed is absent from the committed record and was not delivered.",
        ),
      ],
      why: "Proposed because you mentioned a model and did not state the commit boundary. This is not a requirement until you accept it.",
    });
  }

  if (facts.failures && !requirements.some((requirement) => requirement.key === "integration")) {
    requirements.push(
      statedRequirement(options, {
        key: "failure-behavior",
        title: "Follow the stated failure behavior",
        statement: facts.failures,
        kind: "functional",
        impact: "high",
        why: "You stated what must happen when an important dependency fails.",
        acceptance: ["The failure leaves the system in the state you described, not in an implied success state."],
      }),
    );
  }

  if (facts.signals.payments && !facts.failures) {
    requirements.push({
      id: makeId("req", options),
      key: "payment-failure-proposal",
      title: "Proposal: record payment success only after the provider confirms it",
      statement:
        "A payment is recorded as successful only after the payment provider acknowledges it. A timeout or error leaves the payment unconfirmed and the person's attempt recoverable.",
      kind: "constraint",
      impact: "high",
      origin: "inferred",
      status: "proposed",
      acceptance: [
        criterion(options, "A failed or timed-out charge is not stored as a successful payment."),
      ],
      why: "Proposed because you mentioned payments and did not state the failure rule. This is not a requirement until you accept it.",
    });
  }

  if (facts.nonGoals) {
    for (const line of splitLines(facts.nonGoals)) {
      exclusions.push(line);
      constraints.push(`Out of scope: ${line}`);
    }
  } else if (project.interview.answers.non_goals && isUnknownAnswer(project.interview.answers.non_goals)) {
    openQuestions.push(
      question(
        options,
        "What will the first version deliberately not do?",
        "medium",
        "Without exclusions, implementation briefs have a weaker way to stop scope from growing.",
      ),
    );
  }

  if (facts.constraints) {
    for (const line of splitLines(facts.constraints)) {
      if (isPreference(line)) {
        pushAssumption(`Preference, not a requirement: ${line}`, "A brief should not treat this as a constraint unless you promote it.", "stated");
      } else {
        constraints.push(line);
      }
    }
  }

  if (facts.scale && facts.signals.vagueScale) {
    pushAssumption(
      `Scale language “${excerpt(facts.scale, 120)}” is a hope, not a measured load.`,
      "Designing for unnamed scale adds machinery the first version will not verify.",
    );
  } else if (facts.scale) {
    constraints.push(`Load for the first version: ${facts.scale}`);
  } else if (project.interview.answers.scale && isUnknownAnswer(project.interview.answers.scale)) {
    openQuestions.push(
      question(
        options,
        "What load must the first version survive, as a number you are willing to test?",
        "medium",
        "Unknown load should not be upgraded into a distributed architecture.",
      ),
    );
  }

  if (facts.uncertainties) {
    for (const line of splitLines(facts.uncertainties)) {
      openQuestions.push(
        question(options, line, "medium", "You named this as unresolved. It stays a question until you resolve it."),
      );
    }
  }

  if (facts.signals.fileUpload && !requirements.some((requirement) => /file|upload|attachment/i.test(requirement.statement))) {
    openQuestions.push(
      question(
        options,
        "Which files can be uploaded, what are the size and type limits, and who can fetch them?",
        "medium",
        "File handling that is only implied tends to skip validation and access checks.",
      ),
    );
  }

  for (const contradiction of facts.contradictions) {
    if (!openQuestions.some((item) => item.question === contradiction.question)) {
      openQuestions.push(question(options, contradiction.question, "high", contradiction.consequence));
    }
  }

  for (const id of DRAFT_QUESTION_IDS) {
    if (!project.interview.answers[id]) {
      openQuestions.push(
        question(
          options,
          `Discovery did not answer ${MISSING_LABELS[id]}.`,
          "high",
          "The definition was drafted with that gap still open.",
        ),
      );
    }
  }

  const summary = [
    facts.users ? `Who it is for: ${facts.users}` : "Who it is for is still unknown.",
    facts.outcome ? `Outcome: ${facts.outcome}` : "The outcome is still unknown.",
  ].join("\n\n");

  return {
    summary,
    summaryEdited: false,
    users: facts.users ?? "",
    outcome: facts.outcome ?? "",
    journeys: facts.steps,
    requirements,
    constraints: unique(constraints),
    assumptions,
    openQuestions: dedupeQuestions(openQuestions),
    exclusions: unique(exclusions),
    contextNotes: unique(contextNotes).slice(0, 8),
    acceptedAt: null,
    unknownsAcknowledged: false,
    revision: project.definition?.revision ?? 0,
    answerFingerprint: facts.answerFingerprint,
    edited: false,
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeQuestions(questions: OpenQuestion[]): OpenQuestion[] {
  const seen = new Set<string>();
  return questions.filter((item) => {
    const key = item.question.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function draftBlockers(project: Project): string[] {
  return DRAFT_QUESTION_IDS.filter((id) => !project.interview.answers[id]).map((id) => MISSING_LABELS[id]);
}

export function draftProblemDefinition(
  project: Project,
  options?: EngineOptions & { overwrite?: boolean },
): ActionResult {
  const blockers = draftBlockers(project);
  if (blockers.length > 0) {
    return fail(
      project,
      `Answer the open discovery questions before drafting: ${blockers.join(", ")}. Unknown is an acceptable answer. Skipping is not.`,
    );
  }
  if (project.definition?.acceptedAt && !options?.overwrite) {
    return fail(
      project,
      "The problem definition is already accepted. Edit it in place, or rebuild it explicitly. Rebuilding clears acceptance.",
    );
  }
  if (project.definition?.edited && !project.definition.acceptedAt && !options?.overwrite) {
    return fail(project, "This draft has manual edits. Rebuild only if you intend to replace them.");
  }
  const definition = buildDraft(project, options);
  if (options?.overwrite && project.definition?.acceptedAt) {
    definition.revision = project.definition.revision + 1;
    definition.acceptedAt = null;
  }
  let next: Project = { ...project, definition, activeStage: "define" };
  if (project.definition?.acceptedAt && options?.overwrite) {
    next = markBriefsStale(next, "The accepted problem definition was rebuilt from the interview.");
    next = addLesson(
      next,
      {
        key: "definition-rebuilt",
        title: "Rebuilding a definition reopens the work that depended on it",
        context: project.name,
        explanation:
          "You replaced an accepted problem definition. Briefs and checks that cited the old wording are stale until you review them. Acceptance was cleared so the new text cannot inherit the old approval.",
        principle:
          "A downstream artifact stays valid only while the requirement it cites is the requirement you still mean.",
        deeper:
          "Experienced engineers treat a changed requirement as a new claim. They do not keep the old test result attached to new words. The evidence may still be useful, but it has to be read against the new statement.",
      },
      options,
    );
  }
  return ok(next, options);
}

function withDefinition(project: Project, definition: ProblemDefinition): Project {
  return { ...project, definition };
}

function requireDefinition(project: Project): ProblemDefinition | null {
  return project.definition;
}

export function updateSummary(project: Project, summary: string, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before editing it.");
  const next = bump({ ...definition, summary: summary.trim(), summaryEdited: true });
  return ok(withDefinition(project, next), options);
}

export function updateUsers(project: Project, users: string, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before editing it.");
  return ok(withDefinition(project, bump({ ...definition, users: users.trim() })), options);
}

export function updateOutcome(project: Project, outcome: string, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before editing it.");
  return ok(withDefinition(project, bump({ ...definition, outcome: outcome.trim() })), options);
}

export function addRequirement(project: Project, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before adding a requirement.");
  const requirement: Requirement = {
    id: makeId("req", options),
    key: `custom-${makeId("k", options)}`,
    title: "Untitled requirement",
    statement: "",
    kind: "functional",
    impact: "medium",
    origin: "stated",
    status: "proposed",
    acceptance: [],
    why: "Added by you. It is not in force until the definition is accepted and this requirement is accepted.",
  };
  return ok(
    withDefinition(project, bump({ ...definition, requirements: [...definition.requirements, requirement] })),
    options,
  );
}

export function updateRequirement(
  project: Project,
  requirementId: string,
  patch: Partial<Pick<Requirement, "title" | "statement" | "kind" | "impact" | "why">>,
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before editing a requirement.");
  const current = definition.requirements.find((requirement) => requirement.id === requirementId);
  if (!current) return fail(project, "That requirement is not on this definition.");
  const updated: Requirement = { ...current, ...patch };
  let next = withDefinition(
    project,
    bump({
      ...definition,
      requirements: definition.requirements.map((requirement) =>
        requirement.id === requirementId ? updated : requirement,
      ),
    }),
  );
  next = markChecksForRequirement(next, requirementId, requirementFingerprint(updated), options);
  if (definition.acceptedAt) {
    next = markBriefsStale(next, "A requirement changed after briefs were written.");
  }
  return ok(next, options);
}

export function setRequirementStatus(
  project: Project,
  requirementId: string,
  status: RequirementStatus,
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const current = definition.requirements.find((requirement) => requirement.id === requirementId);
  if (!current) return fail(project, "That requirement is not on this definition.");
  if (status === "accepted" && !current.statement.trim()) {
    return fail(project, "Write the requirement before accepting it.");
  }
  if (status === "accepted" && current.acceptance.filter((item) => item.statement.trim()).length === 0) {
    return fail(project, "Add an acceptance criterion before accepting this requirement.");
  }
  let next = withDefinition(
    project,
    bump({
      ...definition,
      requirements: definition.requirements.map((requirement) =>
        requirement.id === requirementId ? { ...requirement, status } : requirement,
      ),
    }),
  );
  const dropped = status === "rejected" || status === "deferred";
  next = orphanChecksForRequirement(next, requirementId, dropped);
  if (definition.acceptedAt) next = markBriefsStale(next, "A requirement's status changed.");
  return ok(next, options);
}

export function addAcceptanceCriterion(
  project: Project,
  requirementId: string,
  statement: string,
  options?: EngineOptions,
): ActionResult {
  const text = statement.trim();
  if (!text) return fail(project, "Write the acceptance criterion.");
  return mutateRequirement(project, requirementId, options, (requirement) => ({
    ...requirement,
    acceptance: [...requirement.acceptance, criterion(options, text)],
  }));
}

export function updateAcceptanceCriterion(
  project: Project,
  requirementId: string,
  criterionId: string,
  statement: string,
  options?: EngineOptions,
): ActionResult {
  return mutateRequirement(project, requirementId, options, (requirement) => ({
    ...requirement,
    acceptance: requirement.acceptance.map((item) =>
      item.id === criterionId ? { ...item, statement: statement.trim() } : item,
    ),
  }));
}

export function removeAcceptanceCriterion(
  project: Project,
  requirementId: string,
  criterionId: string,
  options?: EngineOptions,
): ActionResult {
  return mutateRequirement(project, requirementId, options, (requirement) => ({
    ...requirement,
    acceptance: requirement.acceptance.filter((item) => item.id !== criterionId),
  }));
}

function mutateRequirement(
  project: Project,
  requirementId: string,
  options: EngineOptions | undefined,
  update: (requirement: Requirement) => Requirement,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const current = definition.requirements.find((requirement) => requirement.id === requirementId);
  if (!current) return fail(project, "That requirement is not on this definition.");
  const updated = update(current);
  let next = withDefinition(
    project,
    bump({
      ...definition,
      requirements: definition.requirements.map((requirement) =>
        requirement.id === requirementId ? updated : requirement,
      ),
    }),
  );
  next = markChecksForRequirement(next, requirementId, requirementFingerprint(updated), options);
  if (definition.acceptedAt) next = markBriefsStale(next, "An acceptance criterion changed.");
  return ok(next, options);
}

export function addOpenQuestion(
  project: Project,
  input: { question: string; impact: Impact; consequence: string },
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before adding a question.");
  const text = input.question.trim();
  if (!text) return fail(project, "Write the question.");
  const entry = question(options, text, input.impact, input.consequence.trim() || "Unresolved.");
  return ok(
    withDefinition(project, bump({ ...definition, openQuestions: [...definition.openQuestions, entry] })),
    options,
  );
}

export function resolveOpenQuestion(
  project: Project,
  questionId: string,
  resolution: string,
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const text = resolution.trim();
  if (!text) return fail(project, "Write how this question was resolved, or leave it open.");
  if (!definition.openQuestions.some((item) => item.id === questionId)) {
    return fail(project, "That question is not on this definition.");
  }
  return ok(
    withDefinition(
      project,
      bump({
        ...definition,
        openQuestions: definition.openQuestions.map((item) =>
          item.id === questionId ? { ...item, resolution: text } : item,
        ),
      }),
    ),
    options,
  );
}

export function addAssumption(
  project: Project,
  input: { statement: string; consequence: string },
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const statement = input.statement.trim();
  if (!statement) return fail(project, "Write the assumption.");
  const entry: Assumption = {
    id: makeId("asm", options),
    statement,
    consequence: input.consequence.trim() || "If this is wrong, revisit the decisions that depend on it.",
    status: "unreviewed",
    origin: "inferred",
  };
  return ok(
    withDefinition(project, bump({ ...definition, assumptions: [...definition.assumptions, entry] })),
    options,
  );
}

export function setAssumptionStatus(
  project: Project,
  assumptionId: string,
  status: Assumption["status"],
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  if (!definition.assumptions.some((item) => item.id === assumptionId)) {
    return fail(project, "That assumption is not on this definition.");
  }
  return ok(
    withDefinition(
      project,
      bump({
        ...definition,
        assumptions: definition.assumptions.map((item) => (item.id === assumptionId ? { ...item, status } : item)),
      }),
    ),
    options,
  );
}

export function addConstraint(project: Project, value: string, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const text = value.trim();
  if (!text) return fail(project, "Write the constraint.");
  return ok(
    withDefinition(project, bump({ ...definition, constraints: [...definition.constraints, text] })),
    options,
  );
}

export function updateConstraint(
  project: Project,
  index: number,
  value: string,
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  if (!definition.constraints[index]) return fail(project, "That constraint is not on this definition.");
  const constraints = definition.constraints.map((item, itemIndex) => (itemIndex === index ? value.trim() : item));
  return ok(withDefinition(project, bump({ ...definition, constraints })), options);
}

export function removeConstraint(project: Project, index: number, options?: EngineOptions): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition first.");
  const constraints = definition.constraints.filter((_, itemIndex) => itemIndex !== index);
  return ok(withDefinition(project, bump({ ...definition, constraints })), options);
}

export function unresolvedHighQuestions(definition: ProblemDefinition): OpenQuestion[] {
  return definition.openQuestions.filter((item) => item.impact === "high" && !item.resolution);
}

export function acceptProblemDefinition(
  project: Project,
  acknowledgeUnknowns: boolean,
  options?: EngineOptions,
): ActionResult {
  const definition = requireDefinition(project);
  if (!definition) return fail(project, "Draft a problem definition before accepting it.");
  const high = unresolvedHighQuestions(definition);
  if (high.length > 0 && !acknowledgeUnknowns) {
    return fail(
      project,
      "High-impact questions are still open. Resolve them, or explicitly acknowledge that you are continuing with those uncertainties.",
    );
  }
  const requirements = definition.requirements.map((requirement) => {
    if (requirement.origin === "stated" && requirement.status === "proposed") {
      return { ...requirement, status: "accepted" as const };
    }
    return requirement;
  });
  const accepted = requirements.filter((requirement) => requirement.status === "accepted");
  if (accepted.length === 0) {
    return fail(
      project,
      "There is no requirement to accept. Write one from what you know, or go back to discovery. I will not invent the missing outcome.",
    );
  }
  const missingCriterion = accepted.find(
    (requirement) => requirement.acceptance.filter((item) => item.statement.trim()).length === 0 || !requirement.statement.trim(),
  );
  if (missingCriterion) {
    return fail(
      project,
      `“${missingCriterion.title}” needs a statement and at least one acceptance criterion before it can be accepted.`,
    );
  }
  const nextDefinition: ProblemDefinition = {
    ...definition,
    requirements,
    acceptedAt: nowIso(options),
    unknownsAcknowledged: high.length > 0,
    revision: definition.revision + 1,
    edited: definition.edited,
  };
  let next = withDefinition(project, nextDefinition);
  next = { ...next, activeStage: "decide" };
  if (high.length > 0) {
    next = addLesson(
      next,
      {
        key: "unknowns-acknowledged",
        title: "A named unknown is part of the design",
        context: `${project.name}: ${high.length} high-impact question${high.length === 1 ? "" : "s"} left open.`,
        explanation:
          "You accepted the problem definition while high-impact questions were still unresolved. The questions stay visible. They are not requirements, and later stages must not pretend they were answered.",
        principle:
          "Shipping with uncertainty is a choice. The choice is defensible only while the unknown, and what it can break, stays written down.",
        deeper:
          "A more experienced engineer separates three lists: what was observed, what was decided, and what is still a guess. The third list is what they re-check when the first implementation surprises them. Hiding it inside a confident spec is how the surprise becomes a production incident.",
      },
      options,
    );
  }
  return ok(next, options);
}

function bump(definition: ProblemDefinition): ProblemDefinition {
  return {
    ...definition,
    edited: true,
    revision: definition.acceptedAt ? definition.revision + 1 : definition.revision,
    unknownsAcknowledged: definition.acceptedAt ? false : definition.unknownsAcknowledged,
  };
}

export function definitionIsStale(project: Project): boolean {
  if (!project.definition) return false;
  return project.definition.answerFingerprint !== collectFacts(project).answerFingerprint;
}

export type { Facts };
