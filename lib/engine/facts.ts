import type { Project } from "@/lib/domain/types";
import { answerFingerprint } from "@/lib/engine/interview";
import { findContradictions, deriveSignals, type Contradiction, type Signals } from "@/lib/engine/signals";
import { answerOf, knownText, splitSteps } from "@/lib/engine/text";

export interface Facts {
  outcome: string | null;
  users: string | null;
  journey: string | null;
  steps: string[];
  observable: string | null;
  nonGoals: string | null;
  data: string | null;
  integrations: string | null;
  auth: string | null;
  ai: string | null;
  failures: string | null;
  constraints: string | null;
  scale: string | null;
  uncertainties: string | null;
  signals: Signals;
  contradictions: Contradiction[];
  answerFingerprint: string;
}

export function collectFacts(project: Project): Facts {
  const answers = project.interview.answers;
  const journey = knownText(answerOf(answers, "journey"));
  return {
    outcome: knownText(answerOf(answers, "outcome")),
    users: knownText(answerOf(answers, "users")),
    journey,
    steps: journey ? splitSteps(journey) : [],
    observable: knownText(answerOf(answers, "observable")),
    nonGoals: knownText(answerOf(answers, "non_goals")),
    data: knownText(answerOf(answers, "data")),
    integrations: knownText(answerOf(answers, "integrations")),
    auth: knownText(answerOf(answers, "auth")),
    ai: knownText(answerOf(answers, "ai_boundary")),
    failures: knownText(answerOf(answers, "failures")),
    constraints: knownText(answerOf(answers, "constraints")),
    scale: knownText(answerOf(answers, "scale")),
    uncertainties: knownText(answerOf(answers, "uncertainties")),
    signals: deriveSignals(project),
    contradictions: findContradictions(project),
    answerFingerprint: answerFingerprint(project),
  };
}
