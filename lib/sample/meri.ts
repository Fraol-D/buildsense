import type { EngineOptions, Project } from "@/lib/domain/types";
import { generateBriefs, setBriefStatus } from "@/lib/engine/briefs";
import { generateDecisions, approveDecision } from "@/lib/engine/decisions";
import { acceptProblemDefinition, draftProblemDefinition } from "@/lib/engine/definition";
import { createProject, submitInterviewAnswer } from "@/lib/engine/interview";
import { addEvidence, generateVerification, setVerificationStatus } from "@/lib/engine/verification";

export const EXAMPLE_PROJECT_ID = "example-meri";

const PURPOSE =
  "Meri is a voice-first assistant for solo operators who miss a call while they are with a customer. It transcribes the call and helps them send a follow-up. This example shows the coaching workflow. Its evidence was written by hand and was not produced by running tests.";

const SCRIPT: Record<string, string> = {
  outcome:
    "A solo operator finishes a missed call with a follow-up the caller receives, and only after the operator has confirmed the draft.",
  users: "Solo operators, such as a shop owner, who are with a customer when a call comes in.",
  journey: [
    "1. An inbound call is captured and the software must transcribe it into a draft request tied to that business.",
    "2. The operator reviews the draft and must confirm the follow-up before anything is sent to the caller.",
    "3. After confirmation, the software must send the follow-up and record that it was sent.",
  ].join("\n"),
  observable:
    "The caller receives the follow-up message, and the operator sees a sent record only after they confirmed the draft.",
  non_goals: "No payments. No multi-staff scheduling. No marketing campaigns.",
  data: "Each business's call transcripts, drafts, and sent follow-ups. Only that business can read or change its own records. Another business must not see them.",
  integrations:
    "A telephony provider receives the inbound call. The provider is not chosen yet. A message service delivers the follow-up.",
  auth: "Each business signs in. One business must be unable to read another business's transcripts or follow-ups.",
  ai_boundary:
    "The model may transcribe and draft the follow-up. A person must confirm that draft before it is stored as sent or delivered to the caller.",
  failures:
    "If transcription or delivery fails, the operator sees the specific error and the follow-up is not recorded as sent.",
  constraints:
    "The team is building this as a web app under hackathon time. Preference: a polished visual design.",
  scale: "Under 50 businesses in the first version. That number is a guess, not a measurement.",
  uncertainties:
    "I have seen owners miss calls and forget to call back. I am guessing which telephony provider we will use.",
};

function engineOptions(): EngineOptions {
  let count = 0;
  return {
    now: "2026-04-12T15:00:00.000Z",
    id: () => String(++count).padStart(4, "0"),
    illustrativeEvidence: true,
  };
}

function must<T extends { ok: boolean; project: Project; error?: string }>(result: T): Project {
  if (!result.ok) throw new Error(result.error ?? "Example project could not be built.");
  return result.project;
}

function answerScript(project: Project, options: EngineOptions): Project {
  let guard = 0;
  while ((project.interview.cursor || project.interview.pending) && guard < 30) {
    guard += 1;
    const pending = project.interview.pending;
    const id = pending?.questionId ?? project.interview.cursor;
    if (!id) break;
    const key = pending?.mode === "challenge" ? `${id}::followup` : id;
    const text = SCRIPT[key] ?? SCRIPT[id];
    if (!text) {
      throw new Error(`Example interview is missing an answer for ${key}.`);
    }
    project = must(submitInterviewAnswer(project, text, options));
  }
  if (project.interview.cursor || project.interview.pending) {
    throw new Error("Example interview did not finish.");
  }
  return project;
}

export function createExampleProject(): Project {
  const options = engineOptions();
  let project = createProject(
    {
      id: EXAMPLE_PROJECT_ID,
      name: "Meri",
      purpose: PURPOSE,
      example: true,
    },
    options,
  );
  project = answerScript(project, options);
  project = must(draftProblemDefinition(project, options));
  const acknowledge = (project.definition?.openQuestions ?? []).some(
    (item) => item.impact === "high" && !item.resolution,
  );
  project = must(acceptProblemDefinition(project, acknowledge, options));
  project = must(generateDecisions(project, options));
  for (const topic of ["ai-commit", "authorization", "data-store"]) {
    const entry = project.decisions.find((item) => item.topic === topic);
    if (!entry) throw new Error(`Example is missing the ${topic} decision.`);
    project = must(approveDecision(project, entry.id, options));
  }
  project = must(generateBriefs(project, options));
  const firstBrief = project.briefs[0];
  if (firstBrief) project = must(setBriefStatus(project, firstBrief.id, "handed-off", options));
  project = must(generateVerification(project, options));

  const confirmed = project.verification.find((item) => item.key === "ai-boundary:malformed-model");
  const failed = project.verification.find((item) => item.key === "integration:dependency-down");
  const claimed = project.verification.find((item) => item.key === "data:wrong-actor");
  const blocked = project.verification.find((item) => item.key === "integration:behavior");
  if (!confirmed || !failed || !claimed || !blocked) {
    throw new Error(
      `Example checks were not created: ${project.verification.map((item) => item.key).join(", ")}`,
    );
  }

  project = must(
    addEvidence(
      project,
      {
        itemId: confirmed.id,
        kind: "test_output",
        note: "Illustrative sample. Not a test run.",
        body: [
          "ILLUSTRATIVE SAMPLE — this output was written by hand for the example project.",
          "Buildsense did not execute this test.",
          "",
          "$ npm test -- confirm-before-send",
          "PASS src/followup.test.ts",
          "✓ an unconfirmed model draft is not delivered",
          "1 passing",
        ].join("\n"),
      },
      options,
    ),
  );
  project = must(setVerificationStatus(project, confirmed.id, "verified", {}, options));

  project = must(
    addEvidence(
      project,
      {
        itemId: failed.id,
        kind: "test_output",
        note: "Illustrative sample. Not a test run.",
        body: [
          "ILLUSTRATIVE SAMPLE — this output was written by hand for the example project.",
          "Buildsense did not execute this test.",
          "",
          "$ npm test -- delivery-failure",
          "FAIL src/delivery.test.ts",
          "AssertionError: expected status 'sent' to equal 'unsent'",
          "Expected: unsent",
          "Received: sent",
          "1 failing",
        ].join("\n"),
      },
      options,
    ),
  );
  project = must(
    setVerificationStatus(
      project,
      failed.id,
      "failed",
      {
        finding:
          "When delivery fails, the illustrative output shows the follow-up stored as sent. The requirement says it must not be recorded as sent.",
      },
      options,
    ),
  );

  project = must(
    addEvidence(
      project,
      {
        itemId: claimed.id,
        kind: "summary",
        note: "This is the kind of claim the coach should refuse to treat as proof.",
        body: "The agent said auth is done and all tests passed.",
      },
      options,
    ),
  );

  project = must(
    setVerificationStatus(project, blocked.id, "blocked", {
      finding: "The telephony provider is not chosen, so the inbound call path cannot be exercised yet.",
    }, options),
  );

  return { ...project, example: true, activeStage: "release" };
}
