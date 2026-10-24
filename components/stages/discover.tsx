"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain/types";
import { draftProblemDefinition } from "@/lib/engine/definition";
import {
  currentPrompt,
  dismissProbe,
  dismissSignal,
  emergingPicture,
  reviseInterviewAnswer,
  submitInterviewAnswer,
} from "@/lib/engine/interview";
import { questionById } from "@/lib/engine/questions";
import { ModelCritique } from "@/components/model-critique";
import { Banner } from "@/components/ui";

export function DiscoverStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const prompt = currentPrompt(project);
  const picture = emergingPicture(project);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reviseId, setReviseId] = useState("");
  const [revision, setRevision] = useState("");

  function commit(result: { ok: boolean; project: Project; error?: string }) {
    if (!result.ok) {
      setError(result.error ?? "That answer was not recorded.");
      return;
    }
    setError(null);
    setAnswer("");
    onChange(result.project);
  }

  const answered = Object.keys(project.interview.answers).filter((id) => questionById(id));

  return (
    <div className="split">
      <section className="stack">
        <div className="coach-log" aria-live="polite">
          {project.interview.messages.map((message) =>
            message.role === "coach" ? (
              <p key={message.id} className="coach">
                {message.body}
              </p>
            ) : (
              <p key={message.id} className="user-line">
                {message.body}
              </p>
            ),
          )}
        </div>
        {prompt ? (
          <form
            className="composer panel"
            onSubmit={(event) => {
              event.preventDefault();
              commit(submitInterviewAnswer(project, answer));
            }}
          >
            <p className="why">{prompt.why}</p>
            <label className="field">
              <span>Your answer</span>
              <textarea
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={prompt.placeholder}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    commit(submitInterviewAnswer(project, answer));
                  }
                }}
              />
            </label>
            <div className="action-row">
              <button className="button" type="submit">
                Answer
              </button>
              <button className="button quiet" type="button" onClick={() => commit(submitInterviewAnswer(project, "I don't know"))}>
                I don&apos;t know
              </button>
              {prompt.suggestions
                .filter((suggestion) => suggestion !== "I don't know")
                .map((suggestion) => (
                  <button key={suggestion} className="button quiet" type="button" onClick={() => setAnswer(suggestion)}>
                    {suggestion}
                  </button>
                ))}
            </div>
            <p className="meta">Ctrl+Enter or Cmd+Enter submits. Unknown is a real answer.</p>
            {prompt.kind === "probe" ? (
              <button className="button quiet" type="button" onClick={() => commit(dismissProbe(project))}>
                Dismiss this probe
              </button>
            ) : null}
          </form>
        ) : (
          <div className="panel stack">
            <p>Discovery has a draft-sized picture. Review it before turning it into requirements.</p>
            <button className="button" type="button" onClick={() => commit(draftProblemDefinition(project))}>
              Draft the problem definition
            </button>
          </div>
        )}
        {picture.readyToDraft && prompt ? (
          <button className="button quiet" type="button" onClick={() => commit(draftProblemDefinition(project))}>
            Draft with the answers so far
          </button>
        ) : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <ModelCritique project={project} task="probe" onChange={onChange} />
        {answered.length > 0 ? (
          <form
            className="panel"
            onSubmit={(event) => {
              event.preventDefault();
              commit(reviseInterviewAnswer(project, reviseId, revision));
              setRevision("");
            }}
          >
            <h3>Revise an earlier answer</h3>
            <label className="field">
              <span>Question</span>
              <select value={reviseId} onChange={(event) => setReviseId(event.target.value)} required>
                <option value="">Choose</option>
                {answered.map((id) => (
                  <option key={id} value={id}>
                    {questionById(id)?.prompt.slice(0, 80)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Revised answer</span>
              <textarea value={revision} onChange={(event) => setRevision(event.target.value)} />
            </label>
            <button className="button quiet" type="submit">
              Save revision
            </button>
          </form>
        ) : null}
      </section>
      <aside className="panel stack">
        <p className="kicker">Emerging picture</p>
        <h2>What is known</h2>
        <p>
          <strong>Outcome. </strong>
          {picture.outcome ?? "Not established."}
        </p>
        <p>
          <strong>Who. </strong>
          {picture.users ?? "Not established."}
        </p>
        <p>
          <strong>Observable check. </strong>
          {picture.observable ?? "Not established."}
        </p>
        {picture.missing.length > 0 ? <p className="meta">Still required before a draft: {picture.missing.join(", ")}.</p> : null}
        {picture.thinSpots.map((spot) => (
          <p key={spot} className="meta">
            {spot}
          </p>
        ))}
        <div>
          <p className="kicker">Detected, not decided</p>
          <div className="chips">
            {picture.signals.length === 0 ? <span className="meta">Nothing consequential detected yet.</span> : null}
            {picture.signals.map((signal) => (
              <button
                key={signal.key}
                type="button"
                className="button quiet"
                onClick={() => commit(dismissSignal(project, signal.key))}
              >
                {signal.label} · not true
              </button>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
