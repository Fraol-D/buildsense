import type { ActionResult, Decision, DecisionOption, EngineOptions, Project } from "@/lib/domain/types";
import { collectFacts } from "@/lib/engine/facts";
import { fail, makeId, nowIso, ok } from "@/lib/engine/id";
import { addLesson } from "@/lib/engine/lessons";
import { markBriefsStale } from "@/lib/engine/staleness";
import { excerpt, fingerprint } from "@/lib/engine/text";

function option(
  id: string,
  name: string,
  summary: string,
  tradeoffs: string[],
  risks: string[],
): DecisionOption {
  return { id, name, summary, tradeoffs, risks };
}

function decision(
  _project: Project,
  options: EngineOptions | undefined,
  input: Omit<Decision, "id" | "chosenOptionId" | "status" | "userNote" | "approvedAt" | "needsReview" | "reviewReason" | "history">,
): Decision {
  return {
    ...input,
    id: makeId("dec", options),
    chosenOptionId: null,
    status: "proposed",
    userNote: "",
    approvedAt: null,
    needsReview: false,
    reviewReason: null,
    history: [],
  };
}

export function decisionBasis(project: Project): string {
  const facts = collectFacts(project);
  return fingerprint({
    signals: facts.signals,
    data: facts.data,
    auth: facts.auth,
    ai: facts.ai,
    failures: facts.failures,
    integrations: facts.integrations,
    scale: facts.scale,
    revision: project.definition?.revision ?? 0,
  });
}

function propose(project: Project, options?: EngineOptions): Decision[] {
  const facts = collectFacts(project);
  const basis = decisionBasis(project);
  const name = project.name;
  const proposed: Decision[] = [];
  const remember = (entry: Decision) => {
    if (proposed.length < 4) proposed.push(entry);
  };

  if (facts.signals.usesAI) {
    remember(
      decision(project, options, {
        topic: "ai-commit",
        title: "What a model is allowed to commit",
        problem: `${name} uses a model somewhere in the workflow. The decision is what that output is allowed to change before a person or a deterministic check accepts it.`,
        options: [
          option(
            "draft-commit",
            "Model drafts, a person or a rule commits",
            "The model can propose text, structure, or an action. A committed record or an outward message is written only after the confirmation you require.",
            [
              "Slower on the happy path, because something other than the model has to say yes.",
              "The confirmation rule is now part of the product and has to be tested.",
            ],
            ["People will rubber-stamp drafts if the confirmation step is decorative."],
          ),
          option(
            "reversible-commit",
            "Model commits reversible, low-impact changes",
            "The model may write a change that is easy to undo and that does not contact another person or move money, and the write is audited.",
            ["Less friction for low-stakes edits.", "You must be honest about which writes are actually reversible."],
            ["A write that feels low-stakes can still leak data or be expensive to undo."],
          ),
          option(
            "direct-commit",
            "Model commits directly",
            "Model output becomes the stored result or is sent onward without a separate check.",
            ["Fastest path.", "The prompt and the model become a hidden part of the contract."],
            [
              "Wrong, empty, or hostile model output is treated as success.",
              "You cannot verify behavior by reading a deterministic rule.",
            ],
          ),
        ],
        recommendedOptionId: "draft-commit",
        recommendationRationale: facts.ai
          ? `You already described a boundary (“${excerpt(facts.ai, 160)}”). Keeping the model on the draft side of that boundary matches what you said and gives verification a rule it can exercise.`
          : `You mentioned a model and left the commit rule open. For ${name}, a draft-then-confirm boundary is the recommendation until you deliberately choose a lower-stakes exception. Direct commit would make model output look like a verified result.`,
        reversalConditions:
          "Revisit this if the output cannot affect another person, money, or a record you cannot restore, and you have an audit trail plus a tested undo.",
        basis,
      }),
    );
  }

  if (facts.signals.multiUser || facts.signals.sensitiveData || facts.signals.payments || facts.signals.regulated) {
    remember(
      decision(project, options, {
        topic: "authorization",
        title: "How access to records is decided",
        problem: `${name} involves more than one person or data that can hurt someone if the wrong person reads it. The decision is where the allow-or-reject check lives.`,
        options: [
          option(
            "explicit-authz",
            "Identity plus a check on every protected read and write",
            "The caller is authenticated, and each protected record is loaded only after a check that this caller may perform this action on this record.",
            [
              "Every sensitive query has to carry the check, which is more code.",
              "The rule can be tested with two identities.",
            ],
            ["A single forgotten query bypasses the rest of the checks."],
          ),
          option(
            "obscure",
            "Hidden URLs or checks that live only in the interface",
            "The server trusts the caller, or possession of a link is treated as permission.",
            ["Faster to build.", "There is no server-side statement of the rule."],
            ["Anyone who receives an identifier can read or change the record.", "A client check does not survive a modified request."],
          ),
          option(
            "defer-auth",
            "Defer identity until a later version",
            "The first version stores and returns records without deciding who the caller is.",
            ["Removes a body of work from the first version."],
            [
              "Shared or sensitive records have no boundary.",
              "Later login does not repair data that was already exposed.",
            ],
          ),
        ],
        recommendedOptionId: "explicit-authz",
        recommendationRationale: facts.auth
          ? `You stated an access rule (“${excerpt(facts.auth, 160)}”). That rule has to be enforced on the read and the write, not only described in the interview.`
          : `${name} describes shared or sensitive data and the access rule is still open. The recommendation is still an explicit check, because deferring it would store the data with no boundary. The exact rule remains an open question until you write it.`,
        reversalConditions:
          "Revisit this only if the first version stores nothing shared or sensitive. A local, single-person tool can defer identity. This project, as described, cannot.",
        basis,
      }),
    );
  }

  if (facts.signals.hasDataToStore || facts.signals.deniesStorage) {
    const localOk = !facts.signals.multiUser && !facts.signals.sensitiveData && !facts.signals.payments;
    remember(
      decision(project, options, {
        topic: "data-store",
        title: "Where the source of truth lives",
        problem: facts.signals.deniesStorage
          ? `${name} currently says the first version does not persist data. The decision is whether that is actually true.`
          : `${name} has to remember something after the session ends. The decision is where that record lives and what rejects an invalid write.`,
        options: [
          option(
            "relational",
            "A database that can reject invalid records",
            "The source of truth is a database with constraints for required fields, uniqueness, and ownership. The interface is not the only validation.",
            [
              "You operate a database and write migrations.",
              "Invalid records fail at the source instead of spreading.",
            ],
            ["A constraint you forget to add is a bug the interface will hide until something else writes the row."],
          ),
          option(
            "local-only",
            "This person's device only",
            "Records stay in the browser or on the local machine. There is no shared server copy.",
            ["No hosting and no remote account boundary.", "Data does not follow the person to another device."],
            [
              "Clearing the browser deletes the work.",
              "You cannot enforce access between two people, because there is no shared check.",
            ],
          ),
          option(
            "document",
            "A document store with few constraints",
            "Records are flexible documents. Validity is mostly applied by application code.",
            ["Easier when the shape is still moving.", "Fewer guarantees that a bad write is rejected."],
            ["Ownership and required fields drift because nothing in the store enforces them."],
          ),
        ],
        recommendedOptionId: facts.signals.deniesStorage ? "local-only" : localOk ? "local-only" : "relational",
        recommendationRationale: facts.signals.deniesStorage
          ? "You said the first version does not persist shared data. Do not add a database to look more serious. If a later answer shows that something must be remembered, this decision has to be reopened."
          : localOk
            ? "The project reads as a single-person tool without shared or sensitive records. Keeping the source of truth on the device avoids an unneeded server. Reopen this the moment a second person must see the same record."
            : `The records you described for ${name} have an owner and can be wrong in ways that matter (${excerpt(facts.data ?? "shared or sensitive data", 120)}). A store that can reject an invalid or unauthorized write belongs in the first version. A document with no constraints would move that burden into code that is easy to bypass.`,
        reversalConditions: localOk
          ? "Revisit this when a second person must read the same record, or when losing the browser storage would be unacceptable."
          : "Revisit the relational recommendation if you are certain the first version is single-user and local, or if the record shape is genuinely unstable and you add constraints in a later migration you are willing to test.",
        basis,
      }),
    );
  }

  if (facts.signals.externalServices || facts.signals.payments || facts.signals.realtime) {
    remember(
      decision(project, options, {
        topic: "integration-failure",
        title: "What happens when a dependency fails",
        problem: `${name} depends on something outside the program. The decision is which state is legal when that call times out, errors, or returns something you did not expect.`,
        options: [
          option(
            "fail-closed",
            "Fail closed and keep the person's input",
            "Do not record success. Show a specific failure. Keep what the person entered so they can retry.",
            ["The person sees the failure instead of a false completed state.", "You have to design the unsent or unconfirmed state."],
            ["A retry can duplicate a side effect unless the call is idempotent."],
          ),
          option(
            "queue",
            "Queue the work and retry",
            "Accept the request into a durable queue and retry the dependency. Success is recorded only when the dependency eventually accepts it.",
            ["Better when the work is allowed to finish later.", "Requires a queue, retries, and a visible pending state."],
            ["The person may think the work finished because the request was accepted into the queue."],
          ),
          option(
            "silent-fallback",
            "Substitute a guessed result",
            "If the dependency fails, the program invents a plausible result and continues.",
            ["The interface looks uninterrupted."],
            ["A guess is stored or sent as if it were the dependency's answer.", "Verification cannot tell a real result from a fabricated one."],
          ),
        ],
        recommendedOptionId: "fail-closed",
        recommendationRationale: facts.failures
          ? `You already described the failure (“${excerpt(facts.failures, 160)}”). Failing closed is the recommendation unless that description truly requires delayed work. A silent fallback would invent a result you did not specify.`
          : `The failure behavior for ${name} is not settled. Until it is, fail closed is the recommendation: no false success, and no guessed substitute. A queue is justified only if you explicitly need the work to complete later.`,
        reversalConditions:
          "Revisit this if the work is allowed to complete later and you will test the pending state, the retry, and the duplicate case.",
        basis,
      }),
    );
  }

  if (proposed.length < 4 && (facts.signals.externalServices || facts.signals.multiUser)) {
    remember(
      decision(project, options, {
        topic: "contract",
        title: "How components agree on a payload",
        problem: `More than one side exchanges data in ${name}. The decision is whether that payload has a schema that rejects surprises.`,
        options: [
          option(
            "schema-contract",
            "Validate a schema at the boundary",
            "Requests, responses, and stored documents are checked against an explicit schema. Unexpected fields and missing required fields fail.",
            ["Another artifact to update when the shape changes.", "Bad payloads fail before they become records."],
            ["A schema that is not used on one of the paths is decoration."],
          ),
          option(
            "informal-json",
            "Informal JSON, agreed by convention",
            "Producers and consumers share an unwritten shape.",
            ["Faster at the start."],
            ["A renamed field becomes a silent empty value.", "The coding agent can drift the shape without a failing check."],
          ),
        ],
        recommendedOptionId: "schema-contract",
        recommendationRationale:
          "There is a boundary between components or services. A schema gives the implementation brief a contract and gives verification a malformed input to send. Informal JSON makes that check a matter of taste.",
        reversalConditions:
          "Revisit this if the first version is a single program with no external payload and no second caller.",
        basis,
      }),
    );
  }

  if (proposed.length === 0) {
    remember(
      decision(project, options, {
        topic: "simplicity",
        title: "How much structure the first version deserves",
        problem: `${name} does not yet have a shared-data, model, or dependency problem that would force a larger design. The decision is whether to add structure anyway.`,
        options: [
          option(
            "single-program",
            "One program, rules in one place",
            "Keep a single deployable unit. Put the business rules in one module. Do not add a service, a queue, or a second database.",
            ["Less to deploy and less to misconfigure.", "You will split it later if a real boundary appears."],
            ["A single module can still become a tangle if every new idea lands in it."],
          ),
          option(
            "split-early",
            "Split into services now",
            "Separate the interface, the rules, and the storage into independently deployed parts before the first version needs that.",
            ["Looks like a larger architecture diagram."],
            [
              "You will debug integration failures before you have users.",
              "The extra boundary is unverified complexity.",
            ],
          ),
        ],
        recommendedOptionId: "single-program",
        recommendationRationale: `Nothing you have stated forces a network boundary inside ${name}. The recommendation is one program and one place for the rules. Split when a second caller, a different scaling need, or a different trust boundary shows up in the requirements.`,
        reversalConditions:
          "Revisit this when a requirement needs a different trust boundary, an independent deploy, or a load you have actually measured.",
        basis,
      }),
    );
  }

  return proposed;
}

export function generateDecisions(project: Project, options?: EngineOptions): ActionResult {
  if (!project.definition?.acceptedAt) {
    return fail(project, "Accept the problem definition before recording engineering decisions.");
  }
  const fresh = propose(project, options);
  const merged: Decision[] = [];
  for (const entry of fresh) {
    const existing = project.decisions.find((item) => item.topic === entry.topic);
    if (!existing) {
      merged.push(entry);
      continue;
    }
    if (existing.status === "proposed") {
      merged.push({
        ...entry,
        id: existing.id,
        userNote: existing.userNote,
        chosenOptionId: existing.chosenOptionId,
        history: existing.history,
      });
      continue;
    }
    const drifted = existing.basis !== entry.basis;
    merged.push({
      ...existing,
      needsReview: drifted || existing.needsReview,
      reviewReason: drifted
        ? "The problem definition changed after this decision was approved. Read it again before relying on it."
        : existing.reviewReason,
    });
  }
  for (const existing of project.decisions) {
    if (!merged.some((item) => item.topic === existing.topic) && existing.status !== "proposed") {
      merged.push({
        ...existing,
        needsReview: true,
        reviewReason: "This approved decision is no longer implied by the current problem. Reopen it or record why it still stands.",
      });
    }
  }
  return ok({ ...project, decisions: merged, activeStage: "decide" }, options);
}

export function selectDecisionOption(
  project: Project,
  decisionId: string,
  optionId: string,
  options?: EngineOptions,
): ActionResult {
  const current = project.decisions.find((item) => item.id === decisionId);
  if (!current) return fail(project, "That decision is not on this project.");
  if (current.status !== "proposed") {
    return fail(project, "This decision is already approved. Revise it if you want a different option.");
  }
  if (!current.options.some((item) => item.id === optionId)) {
    return fail(project, "That option is not part of this decision.");
  }
  return ok(
    {
      ...project,
      decisions: project.decisions.map((item) =>
        item.id === decisionId ? { ...item, chosenOptionId: optionId } : item,
      ),
    },
    options,
  );
}

export function setDecisionNote(
  project: Project,
  decisionId: string,
  note: string,
  options?: EngineOptions,
): ActionResult {
  if (!project.decisions.some((item) => item.id === decisionId)) {
    return fail(project, "That decision is not on this project.");
  }
  return ok(
    {
      ...project,
      decisions: project.decisions.map((item) => (item.id === decisionId ? { ...item, userNote: note } : item)),
    },
    options,
  );
}

export function approveDecision(project: Project, decisionId: string, options?: EngineOptions): ActionResult {
  const current = project.decisions.find((item) => item.id === decisionId);
  if (!current) return fail(project, "That decision is not on this project.");
  if (current.status !== "proposed") return fail(project, "This decision is already approved.");
  const chosen = current.chosenOptionId ?? current.recommendedOptionId;
  const chosenOption = current.options.find((item) => item.id === chosen);
  if (!chosenOption) return fail(project, "The selected option is missing.");
  const diverged = chosen !== current.recommendedOptionId;
  let next: Project = {
    ...project,
    decisions: project.decisions.map((item) =>
      item.id === decisionId
        ? { ...item, chosenOptionId: chosen, status: "approved", approvedAt: nowIso(options), needsReview: false }
        : item,
    ),
  };
  next = markBriefsStale(next, "A decision was approved after briefs were written.");
  next = addLesson(
    next,
    {
      key: `decision:${current.topic}`,
      title: diverged ? "You rejected the recommendation" : "A recommendation becomes a decision only when you approve it",
      context: `${current.title}: ${chosenOption.name}.`,
      explanation: diverged
        ? `The recommendation was “${current.options.find((item) => item.id === current.recommendedOptionId)?.name ?? current.recommendedOptionId}” because ${current.recommendationRationale} You approved “${chosenOption.name}” instead. The risks you accepted: ${chosenOption.risks.join(" ")}`
        : `You approved “${chosenOption.name}”. It was the recommendation because ${current.recommendationRationale} It was not in force before you approved it.`,
      principle: diverged
        ? "Rejecting a recommendation is legitimate. Record the risk you accepted and the condition that would make you reopen it."
        : "Keep the recommendation, the rejected options, and the approval separate. A confident suggestion is not yet a constraint on the implementation.",
      deeper: current.reversalConditions,
    },
    options,
  );
  return ok(next, options);
}

export function reviseDecision(
  project: Project,
  decisionId: string,
  optionId: string,
  note: string,
  options?: EngineOptions,
): ActionResult {
  const current = project.decisions.find((item) => item.id === decisionId);
  if (!current) return fail(project, "That decision is not on this project.");
  if (current.status === "proposed") {
    return fail(project, "Approve the decision before revising it. A revision is a change to something you had already approved.");
  }
  if (!current.options.some((item) => item.id === optionId)) {
    return fail(project, "That option is not part of this decision.");
  }
  const text = note.trim();
  if (!text) return fail(project, "Say why you are revising the decision.");
  let next: Project = {
    ...project,
    decisions: project.decisions.map((item) =>
      item.id === decisionId
        ? {
            ...item,
            status: "revised",
            chosenOptionId: optionId,
            userNote: text,
            approvedAt: nowIso(options),
            needsReview: false,
            reviewReason: null,
            history: [
              ...item.history,
              { at: nowIso(options), optionId: item.chosenOptionId ?? item.recommendedOptionId, note: text },
            ],
          }
        : item,
    ),
  };
  next = markBriefsStale(next, "An approved decision was revised.");
  return ok(next, options);
}

export function chosenOption(entry: Decision): DecisionOption | undefined {
  const id = entry.chosenOptionId ?? (entry.status === "proposed" ? null : entry.recommendedOptionId);
  return entry.options.find((item) => item.id === id);
}

export function approvedDecisions(project: Project): Decision[] {
  return project.decisions.filter((item) => item.status === "approved" || item.status === "revised");
}
