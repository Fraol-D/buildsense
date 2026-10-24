"use client";

import { useState } from "react";
import type { Impact, Project, RequirementKind, RequirementStatus } from "@/lib/domain/types";
import {
  acceptProblemDefinition,
  addAcceptanceCriterion,
  addConstraint,
  addRequirement,
  definitionIsStale,
  draftProblemDefinition,
  removeAcceptanceCriterion,
  removeConstraint,
  resolveOpenQuestion,
  setAssumptionStatus,
  setRequirementStatus,
  unresolvedHighQuestions,
  updateAcceptanceCriterion,
  updateOutcome,
  updateRequirement,
  updateSummary,
  updateUsers,
} from "@/lib/engine/definition";
import { ModelCritique } from "@/components/model-critique";
import { Banner, Pill } from "@/components/ui";

export function DefineStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const definition = project.definition;
  const [error, setError] = useState<string | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [criterionDrafts, setCriterionDrafts] = useState<Record<string, string>>({});
  const [constraint, setConstraint] = useState("");

  function commit(result: { ok: boolean; project: Project; error?: string }) {
    if (!result.ok) {
      setError(result.error ?? "The definition was not updated.");
      return;
    }
    setError(null);
    onChange(result.project);
  }

  if (!definition) {
    return (
      <section className="panel stack">
        <h2>No problem definition yet</h2>
        <p>Finish the discovery questions, including the ones you answer with “I don’t know”, then draft the definition.</p>
        <button className="button" type="button" onClick={() => commit(draftProblemDefinition(project))}>
          Draft from the interview
        </button>
        {error ? <Banner tone="bad">{error}</Banner> : null}
      </section>
    );
  }

  const high = unresolvedHighQuestions(definition);

  return (
    <div className="stack">
      {definition.acceptedAt ? (
        <Banner tone="good">Accepted {definition.acceptedAt.slice(0, 16).replace("T", " ")}. You can still edit it. Changes make later briefs and checks stale.</Banner>
      ) : (
        <Banner>These are drafts. Stated items become requirements when you accept the definition. Proposals do not.</Banner>
      )}
      {definitionIsStale(project) && !definition.acceptedAt ? (
        <Banner tone="warn">The interview changed after this draft.</Banner>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <section className="doc stack">
        <p className="kicker">Problem definition</p>
        <label className="field">
          <span>Summary</span>
          <textarea
            key={`summary:${definition.revision}:${definition.summary}`}
            defaultValue={definition.summary}
            onBlur={(event) => {
              if (event.target.value.trim() !== definition.summary) commit(updateSummary(project, event.target.value));
            }}
          />
        </label>
        <label className="field">
          <span>Who it is for</span>
          <textarea
            key={`users:${definition.users}`}
            defaultValue={definition.users}
            onBlur={(event) => {
              if (event.target.value.trim() !== definition.users) commit(updateUsers(project, event.target.value));
            }}
          />
        </label>
        <label className="field">
          <span>Outcome</span>
          <textarea
            key={`outcome:${definition.outcome}`}
            defaultValue={definition.outcome}
            onBlur={(event) => {
              if (event.target.value.trim() !== definition.outcome) commit(updateOutcome(project, event.target.value));
            }}
          />
        </label>
        {definition.journeys.length > 0 ? (
          <div>
            <p className="kicker">Path</p>
            <ol className="steps">
              {definition.journeys.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {definition.contextNotes.map((note) => (
          <p key={note} className="meta">
            {note}
          </p>
        ))}
      </section>

      <div className="action-row">
        <button className="button quiet" type="button" onClick={() => commit(addRequirement(project))}>
          Add a requirement
        </button>
        {!definition.acceptedAt ? (
          <button className="button quiet" type="button" onClick={() => commit(draftProblemDefinition(project, { overwrite: true }))}>
            Rebuild draft from the interview
          </button>
        ) : null}
      </div>

      {definition.requirements.map((requirement) => (
        <article key={requirement.id} className="doc stack">
          <div className="row">
            <Pill tone={requirement.origin === "inferred" ? "proposed" : "recommendation"}>
              {requirement.origin === "inferred" ? "Proposal" : "From your words"}
            </Pill>
            <Pill tone={requirement.status}>{requirement.status}</Pill>
            <Pill>{requirement.impact}</Pill>
          </div>
          <label className="field">
            <span>Title</span>
            <input
              key={`${requirement.id}:title:${requirement.title}`}
              defaultValue={requirement.title}
              onBlur={(event) => {
                if (event.target.value.trim() !== requirement.title) {
                  commit(updateRequirement(project, requirement.id, { title: event.target.value }));
                }
              }}
            />
          </label>
          <label className="field">
            <span>Requirement</span>
            <textarea
              key={`${requirement.id}:statement:${requirement.statement}`}
              defaultValue={requirement.statement}
              onBlur={(event) => {
                if (event.target.value.trim() !== requirement.statement) {
                  commit(updateRequirement(project, requirement.id, { statement: event.target.value }));
                }
              }}
            />
          </label>
          <p className="meta">{requirement.why}</p>
          <div className="row">
            <label className="field">
              <span>Kind</span>
              <select
                value={requirement.kind}
                onChange={(event) =>
                  commit(updateRequirement(project, requirement.id, { kind: event.target.value as RequirementKind }))
                }
              >
                <option value="functional">Functional</option>
                <option value="nonfunctional">Nonfunctional</option>
                <option value="constraint">Constraint</option>
              </select>
            </label>
            <label className="field">
              <span>Impact</span>
              <select
                value={requirement.impact}
                onChange={(event) =>
                  commit(updateRequirement(project, requirement.id, { impact: event.target.value as Impact }))
                }
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={requirement.status}
                onChange={(event) =>
                  commit(setRequirementStatus(project, requirement.id, event.target.value as RequirementStatus))
                }
              >
                <option value="proposed">Proposed</option>
                <option value="accepted">Accepted</option>
                <option value="deferred">Deferred</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
          </div>
          <div className="stack">
            <p className="kicker">Acceptance criteria</p>
            {requirement.acceptance.map((criterion) => (
              <div key={criterion.id} className="row">
                <input
                  key={criterion.statement}
                  defaultValue={criterion.statement}
                  onBlur={(event) => {
                    if (event.target.value.trim() !== criterion.statement) {
                      commit(updateAcceptanceCriterion(project, requirement.id, criterion.id, event.target.value));
                    }
                  }}
                />
                <button
                  type="button"
                  className="button quiet"
                  onClick={() => commit(removeAcceptanceCriterion(project, requirement.id, criterion.id))}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="row">
              <input
                value={criterionDrafts[requirement.id] ?? ""}
                placeholder="A check someone could observe"
                onChange={(event) =>
                  setCriterionDrafts((current) => ({ ...current, [requirement.id]: event.target.value }))
                }
              />
              <button
                type="button"
                className="button quiet"
                onClick={() => {
                  commit(addAcceptanceCriterion(project, requirement.id, criterionDrafts[requirement.id] ?? ""));
                  setCriterionDrafts((current) => ({ ...current, [requirement.id]: "" }));
                }}
              >
                Add criterion
              </button>
            </div>
          </div>
        </article>
      ))}

      <section className="doc stack">
        <h2>Assumptions</h2>
        {definition.assumptions.length === 0 ? <p className="meta">None recorded.</p> : null}
        {definition.assumptions.map((assumption) => (
          <article key={assumption.id}>
            <p>{assumption.statement}</p>
            <p className="meta">{assumption.consequence}</p>
            <div className="action-row">
              {(["unreviewed", "accepted", "rejected"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`button ${assumption.status === status ? "" : "quiet"}`}
                  onClick={() => commit(setAssumptionStatus(project, assumption.id, status))}
                >
                  {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="doc stack">
        <h2>Open questions</h2>
        {definition.openQuestions.map((item) => (
          <article key={item.id}>
            <div className="row">
              <Pill tone={item.impact === "high" ? "failed" : "unverified"}>{item.impact}</Pill>
              {item.resolution ? <Pill tone="verified">Resolved</Pill> : null}
            </div>
            <p>{item.question}</p>
            <p className="meta">{item.consequence}</p>
            <label className="field">
              <span>Resolution</span>
              <input
                key={`${item.id}:${item.resolution ?? ""}`}
                defaultValue={item.resolution ?? ""}
                placeholder="Leave blank to keep it open"
                onBlur={(event) => {
                  if (event.target.value.trim() && event.target.value.trim() !== item.resolution) {
                    commit(resolveOpenQuestion(project, item.id, event.target.value));
                  }
                }}
              />
            </label>
          </article>
        ))}
      </section>

      <section className="doc stack">
        <h2>Constraints and exclusions</h2>
        <ul className="steps">
          {definition.constraints.map((item, index) => (
            <li key={`${item}:${index}`}>
              {item}{" "}
              <button type="button" className="button quiet" onClick={() => commit(removeConstraint(project, index))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="row">
          <input value={constraint} onChange={(event) => setConstraint(event.target.value)} placeholder="Add a constraint" />
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              commit(addConstraint(project, constraint));
              setConstraint("");
            }}
          >
            Add
          </button>
        </div>
        {definition.exclusions.length > 0 ? <p className="meta">Exclusions: {definition.exclusions.join("; ")}</p> : null}
      </section>

      <ModelCritique project={project} task="critique_definition" onChange={onChange} />

      <section className="panel stack">
        {high.length > 0 ? (
          <Banner tone="warn">
            {high.length} high-impact question{high.length === 1 ? "" : "s"} remain open. Accepting now does not answer
            them.
          </Banner>
        ) : null}
        {high.length > 0 ? (
          <label className="check">
            <input type="checkbox" checked={acknowledge} onChange={(event) => setAcknowledge(event.target.checked)} /> I
            understand these uncertainties can change the design, and I am continuing with them visible.
          </label>
        ) : null}
        <button className="button" type="button" onClick={() => commit(acceptProblemDefinition(project, acknowledge || high.length === 0))}>
          {definition.acceptedAt ? "Accept the definition again" : "Accept definition and move to decisions"}
        </button>
      </section>
    </div>
  );
}
