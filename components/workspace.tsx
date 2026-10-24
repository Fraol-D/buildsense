"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Stage } from "@/lib/domain/types";
import { setActiveStage } from "@/lib/engine/interview";
import { STAGE_META, stageMarkers } from "@/lib/engine/stages";
import { useModelStatus } from "@/lib/model-status";
import { useProjectStore } from "@/lib/persistence/store";
import { DecideStage } from "@/components/stages/decide";
import { DefineStage } from "@/components/stages/define";
import { DiscoverStage } from "@/components/stages/discover";
import { InstructStage } from "@/components/stages/instruct";
import { ReleaseStage } from "@/components/stages/release";
import { VerifyStage } from "@/components/stages/verify";
import { Banner, Pill } from "@/components/ui";

export function Workspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { projects, error, saveError, save, remove } = useProjectStore();
  const { status } = useModelStatus();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (error) {
    return (
      <main className="wrap">
        <Banner tone="bad">{error}</Banner>
      </main>
    );
  }
  if (projects === null) {
    return (
      <main className="wrap">
        <p>Opening the project saved in this browser…</p>
      </main>
    );
  }
  const project = projects.find((item) => item.id === id);
  if (!project) {
    return (
      <main className="wrap stack">
        <h1>This project is not in this browser</h1>
        <p>Buildsense stores projects locally. This id is not among them on this device.</p>
        <Link href="/">Back to projects</Link>
      </main>
    );
  }

  const markers = stageMarkers(project);
  const stage = project.activeStage;

  function change(next: typeof project) {
    if (!next) return;
    void save(next);
  }

  function go(nextStage: Stage) {
    change(setActiveStage(project!, nextStage));
  }

  return (
    <>
      <a className="skip" href="#stage">
        Skip to the current stage
      </a>
      <header className="app-header">
        <div>
          <Link className="brand" href="/">
            Buildsense
          </Link>
          <div className="row">
            <h1 style={{ fontSize: "2rem", margin: 0 }}>{project.name}</h1>
            {project.example ? <Pill tone="example">Example</Pill> : null}
          </div>
        </div>
        <div className="stack">
          <p className="status-line">
            Saved in this browser. {status?.modelConfigured ? `Model critique: ${status.model}.` : "Model critique: off."}
          </p>
          <div className="action-row">
            <button type="button" className="button quiet" onClick={() => dialogRef.current?.showModal()}>
              Judgment ({project.lessons.length})
            </button>
            {confirmDelete ? (
              <button
                type="button"
                className="button danger"
                onClick={() =>
                  void remove(project.id).then(() => {
                    router.push("/");
                  })
                }
              >
                Delete this project
              </button>
            ) : (
              <button type="button" className="button quiet" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </header>
      {saveError ? (
        <div className="wrap">
          <Banner tone="warn">{saveError}</Banner>
        </div>
      ) : null}
      {project.example ? (
        <div className="wrap">
          <Banner tone="warn">
            Example project. Its evidence was written to show the workflow. Buildsense did not execute those checks.
          </Banner>
        </div>
      ) : null}
      <nav className="stage-nav" aria-label="Engineering stages">
        {STAGE_META.map((item) => (
          <button
            key={item.id}
            type="button"
            className={stage === item.id ? "current" : ""}
            aria-current={stage === item.id ? "page" : undefined}
            onClick={() => go(item.id)}
          >
            {item.index} {item.label}
            <span className="meta"> · {markers[item.id].replace("_", " ")}</span>
          </button>
        ))}
      </nav>
      <main id="stage" className="wrap stack">
        <p className="kicker">{STAGE_META.find((item) => item.id === stage)?.index}</p>
        <h2>{STAGE_META.find((item) => item.id === stage)?.label}</h2>
        <p className="lede">{STAGE_META.find((item) => item.id === stage)?.purpose}</p>
        {stage === "discover" ? <DiscoverStage project={project} onChange={change} /> : null}
        {stage === "define" ? <DefineStage project={project} onChange={change} /> : null}
        {stage === "decide" ? <DecideStage project={project} onChange={change} /> : null}
        {stage === "instruct" ? <InstructStage project={project} onChange={change} /> : null}
        {stage === "verify" ? <VerifyStage project={project} onChange={change} /> : null}
        {stage === "release" ? <ReleaseStage project={project} onChange={change} /> : null}
      </main>
      <dialog ref={dialogRef} className="dialog">
        <h2>Judgment</h2>
        {project.lessons.length === 0 ? (
          <p>Lessons show up after a decision, a failure, or a status that outruns the evidence.</p>
        ) : (
          <div className="stack">
            {project.lessons.map((lesson) => (
              <article key={lesson.id}>
                <h3>{lesson.title}</h3>
                <p>{lesson.explanation}</p>
                <p className="meta">{lesson.principle}</p>
              </article>
            ))}
          </div>
        )}
        <form method="dialog">
          <button className="button" type="submit">
            Close
          </button>
        </form>
      </dialog>
    </>
  );
}
