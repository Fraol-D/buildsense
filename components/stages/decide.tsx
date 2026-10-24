"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain/types";
import {
  approveDecision,
  generateDecisions,
  reviseDecision,
  selectDecisionOption,
  setDecisionNote,
} from "@/lib/engine/decisions";
import { ModelCritique } from "@/components/model-critique";
import { Banner, Pill } from "@/components/ui";

export function DecideStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [choices, setChoices] = useState<Record<string, string>>({});

  function commit(result: { ok: boolean; project: Project; error?: string }) {
    if (!result.ok) {
      setError(result.error ?? "The decision was not updated.");
      return;
    }
    setError(null);
    onChange(result.project);
  }

  if (!project.definition?.acceptedAt) {
    return (
      <section className="panel">
        <h2>Decisions wait on an accepted problem</h2>
        <p>Accept the problem definition first. A recommendation made before that would be aimed at an unsettled product.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="button" type="button" onClick={() => commit(generateDecisions(project))}>
          {project.decisions.length > 0 ? "Refresh recommendations" : "Recommend the consequential decisions"}
        </button>
        <p className="meta">A recommendation is not a decision until you approve it.</p>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {project.decisions.length === 0 ? (
        <p>No decisions have been proposed. The coach will only raise choices this project actually forces.</p>
      ) : null}
      {project.decisions.map((decision) => {
        const selected = choices[decision.id] ?? decision.chosenOptionId ?? decision.recommendedOptionId;
        return (
          <article key={decision.id} className="doc stack">
            <div className="row">
              <Pill tone={decision.status}>{decision.status}</Pill>
              {decision.needsReview ? <Pill tone="attention">Needs another look</Pill> : null}
            </div>
            <h2>{decision.title}</h2>
            <p>{decision.problem}</p>
            {decision.reviewReason ? <Banner tone="warn">{decision.reviewReason}</Banner> : null}
            <fieldset className="stack">
              <legend className="kicker">Options</legend>
              {decision.options.map((option) => {
                const recommended = option.id === decision.recommendedOptionId;
                const isSelected = option.id === selected;
                return (
                  <label key={option.id} className={`option ${isSelected ? "selected" : ""} ${recommended ? "recommended" : ""}`}>
                    <span className="row">
                      <input
                        type="radio"
                        name={decision.id}
                        checked={isSelected}
                        onChange={() => {
                          setChoices((current) => ({ ...current, [decision.id]: option.id }));
                          if (decision.status === "proposed") commit(selectDecisionOption(project, decision.id, option.id));
                        }}
                      />
                      <strong>{option.name}</strong>
                      {recommended ? <Pill tone="recommendation">Recommendation</Pill> : null}
                    </span>
                    <span>{option.summary}</span>
                    <span className="meta">Trade-offs: {option.tradeoffs.join(" ")}</span>
                    <span className="meta">Risks: {option.risks.join(" ")}</span>
                  </label>
                );
              })}
            </fieldset>
            <p>
              <strong>Why this is recommended. </strong>
              {decision.recommendationRationale}
            </p>
            <p className="meta">What would change it: {decision.reversalConditions}</p>
            <label className="field">
              <span>Your note</span>
              <textarea
                value={notes[decision.id] ?? decision.userNote}
                onChange={(event) => setNotes((current) => ({ ...current, [decision.id]: event.target.value }))}
                onBlur={() => {
                  const note = notes[decision.id];
                  if (note !== undefined && note !== decision.userNote) commit(setDecisionNote(project, decision.id, note));
                }}
              />
            </label>
            {decision.status === "proposed" ? (
              <button className="button" type="button" onClick={() => commit(approveDecision(project, decision.id))}>
                {selected === decision.recommendedOptionId ? "Approve the recommendation" : "Approve a different option"}
              </button>
            ) : (
              <button
                className="button quiet"
                type="button"
                onClick={() =>
                  commit(reviseDecision(project, decision.id, selected, notes[decision.id] ?? decision.userNote))
                }
              >
                Revise this decision
              </button>
            )}
            {decision.history.length > 0 ? (
              <p className="meta">Previously approved option recorded in the decision history.</p>
            ) : null}
          </article>
        );
      })}
      <ModelCritique project={project} task="critique_decisions" onChange={onChange} />
    </div>
  );
}
