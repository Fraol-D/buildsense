"use client";

import { useState } from "react";
import type { EvidenceKind, Priority, Project, VerificationStatus } from "@/lib/domain/types";
import { addCorrectionBrief } from "@/lib/engine/briefs";
import { EVIDENCE_KINDS } from "@/lib/engine/evidence";
import { addEvidence, generateVerification, setVerificationStatus } from "@/lib/engine/verification";
import { ModelCritique } from "@/components/model-critique";
import { Banner, CopyButton, Pill } from "@/components/ui";

const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];

export function VerifyStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [bodies, setBodies] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [kinds, setKinds] = useState<Record<string, EvidenceKind>>({});
  const [findings, setFindings] = useState<Record<string, string>>({});
  const [overrideFor, setOverrideFor] = useState<string | null>(null);

  function commit(result: { ok: boolean; project: Project; error?: string }, clearId?: string) {
    if (!result.ok) {
      if (result.error?.includes("insufficient")) setOverrideFor(clearId ?? null);
      setError(result.error ?? "The check was not updated.");
      return;
    }
    setError(null);
    setOverrideFor(null);
    if (clearId) setBodies((current) => ({ ...current, [clearId]: "" }));
    onChange(result.project);
  }

  const active = project.verification.filter((item) => !item.orphaned);
  const orphaned = project.verification.filter((item) => item.orphaned);

  return (
    <div className="stack">
      <Banner>
        Buildsense does not run these checks. Paste output, logs, or diffs. A claim that the work is done stays
        unverified.
      </Banner>
      <button className="button" type="button" onClick={() => commit(generateVerification(project))}>
        {active.length > 0 ? "Refresh the verification plan" : "Build a verification plan"}
      </button>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {PRIORITIES.map((priority) => {
        const items = active.filter((item) => item.priority === priority);
        if (items.length === 0) return null;
        return (
          <section key={priority} className="stack">
            <h2>{priority}</h2>
            {items.map((item) => {
              const evidence = project.evidence.filter((entry) => entry.itemId === item.id);
              const requirement = project.definition?.requirements.find((entry) => entry.id === item.requirementId);
              const instructions = [
                `Check: ${item.title}`,
                `Risk: ${item.risk}`,
                `Method: ${item.method}`,
                `Expected: ${item.expected}`,
                `Return: ${item.successEvidence}`,
                "Do not claim success without the command and its output.",
              ].join("\n");
              return (
                <article key={item.id} className="doc stack">
                  <div className="row">
                    <Pill tone={item.status}>{item.status}</Pill>
                    {item.verifiedDespiteInsufficientEvidence ? <Pill tone="attention">Evidence insufficient</Pill> : null}
                    {item.needsReview ? <Pill tone="attention">Needs review</Pill> : null}
                  </div>
                  <h3>{item.title}</h3>
                  <p className="meta">{requirement ? `Requirement: ${requirement.title}` : "Requirement removed."}</p>
                  {item.reviewNote ? <Banner tone="warn">{item.reviewNote}</Banner> : null}
                  <p>
                    <strong>What could go wrong. </strong>
                    {item.risk}
                  </p>
                  <p>
                    <strong>Why it matters. </strong>
                    {item.whyItMatters} {item.priorityReason}
                  </p>
                  <p>
                    <strong>How to test. </strong>
                    {item.method}
                  </p>
                  <p>
                    <strong>Expected. </strong>
                    {item.expected}
                  </p>
                  <p>
                    <strong>Evidence of success. </strong>
                    {item.successEvidence}
                  </p>
                  <p className="meta">What this cannot establish: {item.cannotEstablish}</p>
                  <CopyButton value={instructions} label="Copy check instructions" />
                  {evidence.map((entry) => (
                    <div key={entry.id} className="stack">
                      {entry.illustrative ? (
                        <Banner tone="warn">Illustrative sample. Buildsense did not run this.</Banner>
                      ) : null}
                      <p className="meta">
                        {entry.kind} · {entry.submittedAt.slice(0, 16).replace("T", " ")} · appraisal: {entry.appraisal.label}
                      </p>
                      <p>{entry.appraisal.explanation}</p>
                      {entry.note ? <p className="meta">{entry.note}</p> : null}
                      <pre className="pre">{entry.body}</pre>
                    </div>
                  ))}
                  <label className="field">
                    <span>Evidence kind</span>
                    <select
                      value={kinds[item.id] ?? "test_output"}
                      onChange={(event) =>
                        setKinds((current) => ({ ...current, [item.id]: event.target.value as EvidenceKind }))
                      }
                    >
                      {EVIDENCE_KINDS.map((kind) => (
                        <option key={kind.id} value={kind.id}>
                          {kind.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Paste evidence</span>
                    <textarea
                      value={bodies[item.id] ?? ""}
                      onChange={(event) => setBodies((current) => ({ ...current, [item.id]: event.target.value }))}
                      placeholder="Test output, a log, or a diff. Not a summary that it works."
                    />
                  </label>
                  <label className="field">
                    <span>Note</span>
                    <input
                      value={notes[item.id] ?? ""}
                      onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                  </label>
                  <button
                    className="button quiet"
                    type="button"
                    onClick={() =>
                      commit(
                        addEvidence(project, {
                          itemId: item.id,
                          kind: kinds[item.id] ?? "test_output",
                          body: bodies[item.id] ?? "",
                          note: notes[item.id] ?? "",
                        }),
                        item.id,
                      )
                    }
                  >
                    Record evidence
                  </button>
                  <label className="field">
                    <span>Finding, required for failed or blocked</span>
                    <textarea
                      value={findings[item.id] ?? item.finding}
                      onChange={(event) => setFindings((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                  </label>
                  <div className="action-row">
                    {(["unverified", "verified", "failed", "blocked"] as VerificationStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        className={`button ${item.status === status ? "" : "quiet"}`}
                        onClick={() =>
                          commit(
                            setVerificationStatus(project, item.id, status, {
                              finding: findings[item.id] ?? item.finding,
                              acknowledgeInsufficient: overrideFor === item.id && status === "verified",
                            }),
                            item.id,
                          )
                        }
                      >
                        Mark {status}
                      </button>
                    ))}
                  </div>
                  {overrideFor === item.id ? (
                    <Banner tone="warn">
                      The evidence is insufficient. Choose “Mark verified” again to record the status anyway. Release
                      readiness will keep the gap visible.
                    </Banner>
                  ) : null}
                  {item.status === "failed" ? (
                    <button className="button" type="button" onClick={() => commit(addCorrectionBrief(project, item.id))}>
                      Write a correction brief
                    </button>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}
      {orphaned.length > 0 ? (
        <section className="stack">
          <h2>Checks for requirements you dropped</h2>
          {orphaned.map((item) => (
            <p key={item.id}>
              {item.title} · {item.status}
            </p>
          ))}
        </section>
      ) : null}
      <ModelCritique project={project} task="review_evidence" onChange={onChange} />
    </div>
  );
}
