import { describe, expect, it } from "vitest";
import { handleCoachRequest, parseCritique } from "@/lib/ai/coach";
import type { EngineOptions, Project } from "@/lib/domain/types";
import { generateBriefs } from "@/lib/engine/briefs";
import { generateDecisions } from "@/lib/engine/decisions";
import {
  acceptProblemDefinition,
  draftProblemDefinition,
  updateRequirement,
} from "@/lib/engine/definition";
import { appraiseEvidence } from "@/lib/engine/evidence";
import { createProject, submitInterviewAnswer } from "@/lib/engine/interview";
import { releaseReport } from "@/lib/engine/release";
import { addEvidence, generateVerification, setVerificationStatus } from "@/lib/engine/verification";
import { createExampleProject } from "@/lib/sample/meri";

function options(): EngineOptions {
  let count = 0;
  return { now: "2026-04-12T15:00:00.000Z", id: () => String(++count) };
}

function must(result: { ok: boolean; project: Project; error?: string }): Project {
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

function drive(start: Project, script: Record<string, string>, engine = options()): Project {
  let project = start;
  let guard = 0;
  while ((project.interview.cursor || project.interview.pending) && guard < 40) {
    guard += 1;
    const pending = project.interview.pending;
    const id = pending?.questionId ?? project.interview.cursor;
    if (!id) break;
    const key = pending?.mode === "challenge" ? `${id}::followup` : id;
    const text = script[key] ?? script[id];
    if (!text) throw new Error(`Missing answer for ${key}`);
    project = must(submitInterviewAnswer(project, text, engine));
  }
  return project;
}

const NOTES: Record<string, string> = {
  outcome: "I can find a note I wrote yesterday by the exact phrase I remember.",
  users: "Just me, on my own machine.",
  journey:
    "1. I write a note and the program must save it on this computer.\n2. Later I search for a phrase and the program must show the matching note.",
  observable: "The note I saved yesterday appears in the search results for its phrase.",
  non_goals: "No accounts and no syncing.",
  data: "My notes stay on this computer. Only I use this machine.",
  integrations: "No external services.",
  constraints: "I am the only developer. Preference: a nice font.",
  scale: "One person.",
  uncertainties: "I don't know yet whether search needs to match typos.",
};

describe("discovery", () => {
  it("asks for the outcome first and skips authorization for a single-person local tool", () => {
    const engine = options();
    let project = createProject({ name: "Notes", purpose: "A private note file on my laptop." }, engine);
    expect(project.interview.cursor).toBe("outcome");
    project = drive(project, NOTES, engine);
    expect(project.interview.answers.auth).toBeUndefined();
    expect(project.interview.cursor).toBeNull();
  });

  it("challenges a vague path before moving on", () => {
    const engine = options();
    let project = createProject({ name: "Widget", purpose: "A small tool." }, engine);
    project = must(submitInterviewAnswer(project, "People finish their chores.", engine));
    project = must(submitInterviewAnswer(project, "Household roommates.", engine));
    const result = submitInterviewAnswer(project, "Users use the app to do stuff.", engine);
    project = must(result);
    expect(project.interview.pending?.mode).toBe("challenge");
    expect(project.interview.pending?.prompt.toLowerCase()).toContain("ordered steps");
  });

  it("does not turn an unknown into a requirement", () => {
    const engine = options();
    let project = createProject(
      { name: "Desk", purpose: "Help a person remember one decision." },
      engine,
    );
    project = drive(
      project,
      {
        ...NOTES,
        data: "I don't know",
        users: "Just me, on my own machine.",
      },
      engine,
    );
    project = must(draftProblemDefinition(project, engine));
    expect(project.definition?.requirements.some((item) => item.key === "data")).toBe(false);
    expect(project.definition?.openQuestions.some((item) => item.impact === "high" && /remember/i.test(item.question))).toBe(
      true,
    );
  });
});

describe("decisions and briefs", () => {
  it("keeps a simple project to one modest decision and does not prescribe services", () => {
    const engine = options();
    let project = createProject({ name: "Notes", purpose: "A private note file on my laptop." }, engine);
    project = drive(project, NOTES, engine);
    project = must(draftProblemDefinition(project, engine));
    project = must(acceptProblemDefinition(project, true, engine));
    project = must(generateDecisions(project, engine));
    expect(project.decisions.length).toBeLessThanOrEqual(2);
    expect(project.decisions.some((item) => item.topic === "authorization")).toBe(false);
    expect(project.decisions.every((item) => item.status === "proposed")).toBe(true);
    const text = JSON.stringify(project.decisions);
    expect(text.toLowerCase()).not.toContain("microservice");
    expect(project.decisions.some((item) => item.topic === "simplicity" || item.topic === "data-store")).toBe(true);
  });

  it("writes a brief with exclusions, tests, and evidence the agent must return", () => {
    const engine = options();
    let project = createProject({ name: "Notes", purpose: "A private note file on my laptop." }, engine);
    project = drive(project, NOTES, engine);
    project = must(draftProblemDefinition(project, engine));
    project = must(acceptProblemDefinition(project, true, engine));
    project = must(generateDecisions(project, engine));
    const decision = project.decisions[0];
    project = {
      ...project,
      decisions: project.decisions.map((item) =>
        item.id === decision.id
          ? {
              ...item,
              status: "approved" as const,
              chosenOptionId: item.recommendedOptionId,
              approvedAt: "2026-04-12T15:00:00.000Z",
            }
          : item,
      ),
    };
    project = must(generateBriefs(project, engine));
    const markdown = project.briefs.map((brief) => brief.markdown).join("\n");
    expect(markdown).toContain("Out of scope");
    expect(markdown).toContain("Tests to add or run");
    expect(markdown).toContain("Evidence to return");
    expect(markdown.toLowerCase()).toContain("do not report done");
  });
});

describe("verification honesty", () => {
  it("treats an agent's assurance as insufficient and refuses verified with no evidence", () => {
    const claim = appraiseEvidence("All tests passed. The agent said it works.", {
      title: "Save a note",
      expected: "The note appears after a reload.",
    });
    expect(claim.label).toBe("insufficient");

    const engine = options();
    let project = createProject({ name: "Notes", purpose: "A private note file on my laptop." }, engine);
    project = drive(project, NOTES, engine);
    project = must(draftProblemDefinition(project, engine));
    project = must(acceptProblemDefinition(project, true, engine));
    project = must(generateVerification(project, engine));
    const item = project.verification[0];
    const refused = setVerificationStatus(project, item.id, "verified", {}, engine);
    expect(refused.ok).toBe(false);

    project = must(
      addEvidence(project, { itemId: item.id, kind: "summary", body: "All tests passed. The agent said it works.", note: "" }, engine),
    );
    const stillRefused = setVerificationStatus(project, item.id, "verified", {}, engine);
    expect(stillRefused.ok).toBe(false);
    const overridden = must(
      setVerificationStatus(project, item.id, "verified", { acknowledgeInsufficient: true }, engine),
    );
    const report = releaseReport(overridden);
    expect(report.overrides.length).toBeGreaterThan(0);
    expect(report.summary.toLowerCase()).not.toContain("confidence");
    expect(report.summary).not.toMatch(/\d%/);
    expect(report.recommendation).not.toBe("no_critical_gaps");
  });

  it("returns a changed requirement to unverified", () => {
    const engine = options();
    let project = createProject({ name: "Notes", purpose: "A private note file on my laptop." }, engine);
    project = drive(project, NOTES, engine);
    project = must(draftProblemDefinition(project, engine));
    project = must(acceptProblemDefinition(project, true, engine));
    project = must(generateVerification(project, engine));
    const item = project.verification[0];
    project = must(
      addEvidence(
        project,
        {
          itemId: item.id,
          kind: "test_output",
          body: "PASS notes.test.ts\n1 passing\nThe note I saved yesterday appears in the search results.",
          note: "",
        },
        engine,
      ),
    );
    project = must(setVerificationStatus(project, item.id, "verified", {}, engine));
    const requirement = project.definition?.requirements.find((entry) => entry.id === item.requirementId);
    project = must(
      updateRequirement(project, requirement!.id, { statement: "A different obligation than the one that was checked." }, engine),
    );
    project = must(generateVerification(project, engine));
    const updated = project.verification.find((entry) => entry.id === item.id);
    expect(updated?.status).toBe("unverified");
    expect(updated?.needsReview).toBe(true);
  });
});

describe("example project", () => {
  it("keeps illustrative evidence and does not justify shipping", () => {
    const project = createExampleProject();
    expect(project.example).toBe(true);
    expect(project.evidence.every((item) => item.illustrative)).toBe(true);
    expect(project.evidence.some((item) => item.body.includes("ILLUSTRATIVE SAMPLE"))).toBe(true);
    expect(project.verification.some((item) => item.status === "failed")).toBe(true);
    expect(project.verification.some((item) => item.status === "unverified")).toBe(true);
    expect(project.verification.some((item) => item.status === "blocked")).toBe(true);
    const report = releaseReport(project);
    expect(report.recommendation).toBe("not_justified");
    expect(report.summary.toLowerCase()).toContain("illustrative");
    expect(report.summary.toLowerCase()).not.toContain("confidence score");
    expect(project.briefs.some((brief) => brief.markdown.includes("Out of scope"))).toBe(true);
    expect(project.decisions.some((item) => item.status === "approved")).toBe(true);
    expect(project.decisions.some((item) => item.status === "proposed")).toBe(true);
  });
});

describe("model critique boundary", () => {
  it("stays unavailable without a key and does not echo a key when a call fails", async () => {
    const missing = await handleCoachRequest(
      JSON.stringify({ task: "critique_definition", context: "Project notes." }),
      {},
    );
    expect(missing.status).toBe(503);
    expect(JSON.stringify(missing.body)).not.toContain("verified");

    const secret = "xai-test-secret-value";
    const failed = await handleCoachRequest(
      JSON.stringify({ task: "review_evidence", context: "Evidence pasted by the user." }),
      {
        apiKey: secret,
        fetchImpl: async () =>
          new Response(JSON.stringify({ error: `leaked ${secret}` }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain(secret);
  });

  it("returns a critique without a verification status", async () => {
    const response = await handleCoachRequest(
      JSON.stringify({ task: "probe", context: "The user has not named an access rule." }),
      {
        apiKey: "test-key",
        fetchImpl: async (_input, init) => {
          const body = JSON.parse(String(init?.body));
          expect(body.model).toBe("grok-4.7");
          expect(body.messages[0].content).toContain("Never say that a requirement is verified");
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      commentary: "The access rule is still missing. Do not pretend it exists.",
                      suggestions: [
                        {
                          kind: "open_question",
                          text: "Who is rejected when they ask for someone else's note?",
                          impact: "high",
                          why: "The notes are described as private.",
                        },
                      ],
                    }),
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        },
      },
    );
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("status");
    const critique = response.body.critique as { suggestions: { kind: string }[] };
    expect(critique.suggestions[0]?.kind).toBe("open_question");
    expect(parseCritique("not json")).toBeNull();
  });
});
