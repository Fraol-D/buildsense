"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain/types";
import { attachLessonCommentary } from "@/lib/engine/critique";
import { releaseReport } from "@/lib/engine/release";
import { ModelCritique } from "@/components/model-critique";
import { Banner, Pill } from "@/components/ui";

export function ReleaseStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const report = releaseReport(project);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const tone =
    report.recommendation === "not_justified" ? "bad" : report.recommendation === "no_critical_gaps" ? "good" : "warn";

  return (
    <div className="stack">
      {project.example ? (
        <Banner tone="warn">
          Meri is an example. The evidence below was written to demonstrate the workflow. Buildsense did not run these
          tests.
        </Banner>
      ) : null}
      <section className="doc stack">
        <p className="kicker">Release record</p>
        <h2>{report.headline}</h2>
        <Banner tone={tone}>{report.summary}</Banner>
        <p className="meta">
          {report.counts.verified} verified · {report.counts.failed} failed · {report.counts.unverified} unverified ·{" "}
          {report.counts.blocked} blocked
        </p>
      </section>
      {report.blockers.length > 0 ? (
        <section className="stack">
          <h2>Gaps on the record</h2>
          {report.blockers.map((blocker) => (
            <article key={`${blocker.title}:${blocker.status}`} className="trace-row">
              <div className="row">
                <strong>{blocker.title}</strong>
                <Pill tone={blocker.status.includes("fail") ? "failed" : "unverified"}>{blocker.status}</Pill>
              </div>
              <p>{blocker.detail}</p>
            </article>
          ))}
        </section>
      ) : null}
      {report.unknowns.length > 0 ? (
        <section className="doc">
          <h2>Still unknown</h2>
          <ul className="steps">
            {report.unknowns.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="stack">
        <h2>Trace</h2>
        {report.trace.length === 0 ? <p>No accepted requirements to trace.</p> : null}
        {report.trace.map((row) => (
          <article key={row.requirementId} className="trace-row stack">
            <div className="row">
              <h3>{row.title}</h3>
              <Pill>{row.impact}</Pill>
              <Pill tone={row.origin === "inferred" ? "proposed" : "recommendation"}>{row.origin}</Pill>
            </div>
            <p className="meta">Decisions: {row.decisions.join(", ") || "None approved for this requirement."}</p>
            <p className="meta">Briefs: {row.briefs.join(", ") || "No brief cites it."}</p>
            {row.checks.length === 0 ? <p>No check.</p> : null}
            {row.checks.map((check) => (
              <p key={check.id}>
                {check.title} · {check.priority} · {check.status}
                {check.insufficient ? " · marked verified without sufficient evidence" : ""}
              </p>
            ))}
          </article>
        ))}
      </section>
      <section className="doc">
        <h2>What this record does not establish</h2>
        <ul className="steps">
          {report.notEstablished.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="stack">
        <h2>Judgment from this project</h2>
        {project.lessons.length === 0 ? (
          <p className="meta">Lessons are recorded when you approve a decision, acknowledge a high-impact unknown, or close a check.</p>
        ) : null}
        {project.lessons.map((lesson) => (
          <article key={lesson.id} className="lesson stack">
            <h3>{lesson.title}</h3>
            <p className="meta">{lesson.context}</p>
            <p>{lesson.explanation}</p>
            <p>
              <strong>Principle. </strong>
              {lesson.principle}
            </p>
            <button
              type="button"
              className="button quiet"
              onClick={() => setOpenLesson(openLesson === lesson.id ? null : lesson.id)}
            >
              {openLesson === lesson.id ? "Hide the deeper note" : "Go deeper"}
            </button>
            {openLesson === lesson.id ? <p className="coach">{lesson.deeper}</p> : null}
            {lesson.modelNote ? <p className="meta">Note: {lesson.modelNote}</p> : null}
            <LessonAttach project={project} lessonId={lesson.id} onChange={onChange} />
          </article>
        ))}
      </section>
      <ModelCritique project={project} task="deepen_lesson" onChange={onChange} />
    </div>
  );
}

function LessonAttach({
  project,
  lessonId,
  onChange,
}: {
  project: Project;
  lessonId: string;
  onChange: (project: Project) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const result = attachLessonCommentary(project, lessonId, note);
        if (result.ok) onChange(result.project);
      }}
    >
      <label className="field">
        <span>Attach a note you want to remember</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button className="button quiet" type="submit">
        Save note on this lesson
      </button>
    </form>
  );
}
