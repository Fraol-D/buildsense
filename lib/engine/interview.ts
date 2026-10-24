import type { EngineOptions, InterviewMessage, InterviewState, Project, Stage } from "@/lib/domain/types";
import { fail, makeId, nowIso, ok, touch } from "@/lib/engine/id";
import { DRAFT_QUESTION_IDS, QUESTIONS, questionById, type CoachQuestion } from "@/lib/engine/questions";
import { SIGNAL_CHIPS, deriveSignals, findContradictions } from "@/lib/engine/signals";
import { answerOf, fingerprint, isUnknownAnswer, knownText } from "@/lib/engine/text";
import type { ActionResult } from "@/lib/domain/types";

function blankInterview(): InterviewState {
  return {
    answers: {},
    challengesAsked: [],
    contradictionsNoted: [],
    pending: null,
    cursor: null,
    messages: [],
    dismissedSignals: [],
  };
}

function message(
  project: Project,
  role: InterviewMessage["role"],
  kind: InterviewMessage["kind"],
  body: string,
  questionId: string | undefined,
  options?: EngineOptions,
): Project {
  const entry: InterviewMessage = {
    id: makeId("msg", options),
    role,
    kind,
    body,
    questionId,
    at: nowIso(options),
  };
  return {
    ...project,
    interview: { ...project.interview, messages: [...project.interview.messages, entry] },
  };
}

function noteContradictions(project: Project, options?: EngineOptions): Project {
  let next = project;
  for (const contradiction of findContradictions(next)) {
    if (next.interview.contradictionsNoted.includes(contradiction.id)) continue;
    next = message(next, "coach", "guidance", contradiction.message, undefined, options);
    next = {
      ...next,
      interview: {
        ...next.interview,
        contradictionsNoted: [...next.interview.contradictionsNoted, contradiction.id],
      },
    };
  }
  return next;
}

function advance(project: Project, options?: EngineOptions): Project {
  const signals = deriveSignals(project);
  const context = { purpose: project.purpose, answers: project.interview.answers, signals };
  const nextQuestion = QUESTIONS.find(
    (question) => question.include(context) && !project.interview.answers[question.id],
  );
  if (!nextQuestion) {
    const alreadyClosed = project.interview.messages.some(
      (entry) => entry.kind === "note" && entry.body.startsWith("The interview has covered"),
    );
    if (alreadyClosed) {
      return { ...project, interview: { ...project.interview, cursor: null } };
    }
    const closed = message(
      project,
      "coach",
      "note",
      "The interview has covered the questions this project needs. Draft the problem definition when you are ready. I will turn what you stated into requirements, and I will leave unknowns as questions instead of inventing them.",
      undefined,
      options,
    );
    return { ...closed, interview: { ...closed.interview, cursor: null } };
  }
  const alreadyAsked = project.interview.messages.some(
    (entry) => entry.kind === "question" && entry.questionId === nextQuestion.id,
  );
  const withQuestion = alreadyAsked
    ? project
    : message(project, "coach", "question", nextQuestion.prompt, nextQuestion.id, options);
  return { ...withQuestion, interview: { ...withQuestion.interview, cursor: nextQuestion.id } };
}

export function createProject(
  input: { name: string; purpose: string; example?: boolean; id?: string },
  options?: EngineOptions,
): Project {
  const now = nowIso(options);
  const project: Project = {
    schemaVersion: 1,
    id: input.id ?? makeId("prj", options),
    name: input.name.trim(),
    purpose: input.purpose.trim(),
    createdAt: now,
    updatedAt: now,
    example: Boolean(input.example),
    activeStage: "discover",
    interview: blankInterview(),
    definition: null,
    decisions: [],
    briefs: [],
    verification: [],
    evidence: [],
    lessons: [],
  };
  return advance(project, options);
}

export function submitInterviewAnswer(
  project: Project,
  raw: string,
  options?: EngineOptions,
): ActionResult {
  const text = raw.trim();
  if (!text) return fail(project, "Write an answer, or say you do not know.");
  const stored = isUnknownAnswer(text) ? "I don't know" : text;
  const pending = project.interview.pending;

  if (pending) {
    const key =
      pending.mode === "challenge" ? `${pending.questionId}::challenge` : `probe:${pending.questionId}`;
    let next = message(project, "user", "answer", text, pending.questionId, options);
    next = {
      ...next,
      interview: {
        ...next.interview,
        answers: { ...next.interview.answers, [key]: stored },
        pending: null,
      },
    };
    if (isUnknownAnswer(text) && pending.mode === "challenge") {
      next = message(
        next,
        "coach",
        "guidance",
        "We will keep the earlier answer, and the gap it left will show up as an open question if it still matters.",
        pending.questionId,
        options,
      );
    }
    next = noteContradictions(next, options);
    next = advance(next, options);
    return ok(next, options);
  }

  const cursor = project.interview.cursor;
  if (!cursor) {
    return fail(project, "There is no open question. Draft the problem definition, or revise an earlier answer.");
  }
  const question = questionById(cursor);
  if (!question) return fail(project, "The current question is no longer part of this interview.");

  let next = message(project, "user", "answer", text, cursor, options);
  next = {
    ...next,
    interview: {
      ...next.interview,
      answers: { ...next.interview.answers, [cursor]: stored },
    },
  };

  if (isUnknownAnswer(text)) {
    next = message(next, "coach", "guidance", question.unknownGuidance, cursor, options);
  } else if (question.challenge && !next.interview.challengesAsked.includes(cursor)) {
    const challenge = question.challenge(stored, {
      purpose: next.purpose,
      answers: next.interview.answers,
      signals: deriveSignals(next),
    });
    if (challenge) {
      next = {
        ...next,
        interview: {
          ...next.interview,
          challengesAsked: [...next.interview.challengesAsked, cursor],
          pending: { questionId: cursor, prompt: challenge, mode: "challenge" },
        },
      };
      next = message(next, "coach", "challenge", challenge, cursor, options);
      next = noteContradictions(next, options);
      return ok(next, options);
    }
  }

  next = noteContradictions(next, options);
  next = advance(next, options);
  return ok(next, options);
}

export function reviseInterviewAnswer(
  project: Project,
  questionId: string,
  raw: string,
  options?: EngineOptions,
): ActionResult {
  if (!project.interview.answers[questionId]) {
    return fail(project, "That question has not been answered yet.");
  }
  const text = raw.trim();
  if (!text) return fail(project, "Write the revised answer, or say you do not know.");
  const stored = isUnknownAnswer(text) ? "I don't know" : text;
  const answers = { ...project.interview.answers, [questionId]: stored };
  delete answers[`${questionId}::challenge`];
  let next: Project = {
    ...project,
    interview: {
      ...project.interview,
      answers,
      challengesAsked: project.interview.challengesAsked.filter((id) => id !== questionId),
      pending: project.interview.pending?.questionId === questionId ? null : project.interview.pending,
    },
  };
  next = message(next, "user", "answer", `Revised answer: ${text}`, questionId, options);
  const question = questionById(questionId);
  if (question?.challenge && !isUnknownAnswer(stored)) {
    const challenge = question.challenge(stored, {
      purpose: next.purpose,
      answers: next.interview.answers,
      signals: deriveSignals(next),
    });
    if (challenge) {
      next = {
        ...next,
        interview: {
          ...next.interview,
          challengesAsked: [...next.interview.challengesAsked, questionId],
          pending: { questionId, prompt: challenge, mode: "challenge" },
        },
      };
      next = message(next, "coach", "challenge", challenge, questionId, options);
      return ok(noteContradictions(next, options), options);
    }
  }
  next = noteContradictions(next, options);
  if (!next.interview.pending) next = advance(next, options);
  return ok(next, options);
}

export function dismissSignal(project: Project, key: string, options?: EngineOptions): ActionResult {
  if (!SIGNAL_CHIPS.some((chip) => chip.key === key)) {
    return fail(project, "That is not a detected property you can dismiss.");
  }
  if (project.interview.dismissedSignals.includes(key)) return ok(project, options);
  let next: Project = {
    ...project,
    interview: {
      ...project.interview,
      dismissedSignals: [...project.interview.dismissedSignals, key],
    },
  };
  const label = SIGNAL_CHIPS.find((chip) => chip.key === key)?.label ?? key;
  next = message(
    next,
    "coach",
    "note",
    `I will not treat “${label}” as a property of this project. Questions that depended only on it will drop out.`,
    undefined,
    options,
  );
  if (next.interview.pending) return ok(next, options);
  return ok(advance(next, options), options);
}

export function insertProbe(project: Project, prompt: string, options?: EngineOptions): ActionResult {
  const text = prompt.trim();
  if (!text) return fail(project, "The probe was empty.");
  if (project.interview.pending) {
    return fail(project, "Answer the current follow-up before adding another probe.");
  }
  const id = makeId("probe", options);
  let next = message(project, "coach", "challenge", text, id, options);
  next = {
    ...next,
    interview: {
      ...next.interview,
      pending: { questionId: id, prompt: text, mode: "probe" },
    },
  };
  return ok(next, options);
}

export function dismissProbe(project: Project, options?: EngineOptions): ActionResult {
  if (project.interview.pending?.mode !== "probe") {
    return fail(project, "There is no model probe waiting for an answer.");
  }
  let next: Project = {
    ...project,
    interview: { ...project.interview, pending: null },
  };
  next = message(
    next,
    "coach",
    "note",
    "The model probe was dismissed. It was not turned into a requirement.",
    undefined,
    options,
  );
  return ok(next, options);
}

export interface CurrentPrompt {
  id: string;
  prompt: string;
  why: string;
  placeholder: string;
  suggestions: string[];
  kind: "question" | "challenge" | "probe";
}

export function currentPrompt(project: Project): CurrentPrompt | null {
  if (project.interview.pending) {
    return {
      id: project.interview.pending.questionId,
      prompt: project.interview.pending.prompt,
      why:
        project.interview.pending.mode === "probe"
          ? "This probe came from the model. Answering it records your words. It does not create a requirement by itself."
          : "This follow-up is here because the last answer would change the design if it stays vague.",
      placeholder: "Be specific, or say you do not know.",
      suggestions: ["I don't know"],
      kind: project.interview.pending.mode,
    };
  }
  const question: CoachQuestion | undefined = questionById(project.interview.cursor ?? "");
  if (!question) return null;
  return {
    id: question.id,
    prompt: question.prompt,
    why: question.why,
    placeholder: question.placeholder,
    suggestions: question.suggestions ?? [],
    kind: "question",
  };
}

export interface EmergingPicture {
  outcome: string | null;
  users: string | null;
  journey: string | null;
  observable: string | null;
  signals: { key: string; label: string }[];
  missing: string[];
  readyToDraft: boolean;
  thinSpots: string[];
}

const MISSING_LABELS: Record<string, string> = {
  outcome: "the outcome",
  users: "who it is for",
  journey: "the primary path",
  observable: "an observable success check",
};

export function emergingPicture(project: Project): EmergingPicture {
  const answers = project.interview.answers;
  const missing = DRAFT_QUESTION_IDS.filter((id) => !answers[id]).map((id) => MISSING_LABELS[id]);
  const thinSpots: string[] = [];
  const observable = knownText(answerOf(answers, "observable"));
  if (answers.outcome && knownText(answerOf(answers, "outcome")) === null) {
    thinSpots.push("The outcome was answered as unknown.");
  }
  if (answers.observable && observable === null) {
    thinSpots.push("There is no observable success check yet.");
  }
  if (observable && /\b(easy|fast|simple|modern)\b/i.test(observable)) {
    thinSpots.push("The success check still leans on a preference word.");
  }
  const journey = knownText(answerOf(answers, "journey"));
  if (journey && journey.split(/\s+/).length < 25) {
    thinSpots.push("The primary path is still short. The definition will keep that weakness visible.");
  }
  const signals = deriveSignals(project);
  return {
    outcome: knownText(answerOf(answers, "outcome")),
    users: knownText(answerOf(answers, "users")),
    journey: knownText(answerOf(answers, "journey")),
    observable: knownText(answerOf(answers, "observable")),
    signals: SIGNAL_CHIPS.filter((chip) => signals[chip.key]).map((chip) => ({
      key: chip.key,
      label: chip.label,
    })),
    missing,
    readyToDraft: missing.length === 0,
    thinSpots,
  };
}

export function answerFingerprint(project: Project): string {
  return fingerprint(project.interview.answers);
}

export function setActiveStage(project: Project, stage: Stage, options?: EngineOptions): Project {
  return touch({ ...project, activeStage: stage }, options);
}
