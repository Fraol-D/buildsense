"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createProject } from "@/lib/engine/interview";
import { STAGE_META } from "@/lib/engine/stages";
import { useModelStatus } from "@/lib/model-status";
import { useProjectStore } from "@/lib/persistence/store";
import { Banner } from "@/components/ui";
import { excerpt } from "@/lib/engine/text";

export function HomeScreen() {
  const router = useRouter();
  const { projects, error, saveError, save, restoreExample } = useProjectStore();
  const { status } = useModelStatus();
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPurpose = purpose.trim();
    if (trimmedName.length < 2) {
      setFormError("Name the project.");
      return;
    }
    if (trimmedPurpose.length < 40) {
      setFormError("Say who it is for and what it must accomplish. One specific sentence is enough.");
      return;
    }
    setPending(true);
    setFormError(null);
    const project = createProject({ name: trimmedName, purpose: trimmedPurpose });
    await save(project);
    router.push(`/projects/${project.id}`);
  }

  return (
    <>
      <header className="app-header">
        <Link className="brand" href="/">
          Buildsense
        </Link>
        <p className="status-line">
          Saved in this browser only.
          {status?.modelConfigured ? ` Model critique: ${status.model}.` : " Model critique: off."}
        </p>
      </header>
      <main className="wrap">
        <p className="kicker">Engineering coach</p>
        <h1>Think before the agent writes.</h1>
        <p className="lede">
          Buildsense walks a software project through the problem, the decisions, the instructions you hand to a
          coding agent, and the evidence that would justify a release. Generated code is not treated as correctness.
        </p>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {saveError ? <Banner tone="warn">{saveError}</Banner> : null}
        <div className="home-grid" style={{ marginTop: "1.5rem" }}>
          <form className="panel" onSubmit={(event) => void onSubmit(event)}>
            <h2>Start a project</h2>
            <label className="field">
              <span>Project name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required />
            </label>
            <label className="field">
              <span>Purpose</span>
              <textarea
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                maxLength={2000}
                placeholder="Who is it for, and what must they be able to finish?"
                required
              />
            </label>
            {formError ? <Banner tone="bad">{formError}</Banner> : null}
            <button className="button" type="submit" disabled={pending || projects === null}>
              {pending ? "Creating…" : "Begin discovery"}
            </button>
          </form>
          <section className="stack">
            <h2>Projects</h2>
            {projects === null ? <p>Opening projects saved in this browser…</p> : null}
            {projects?.length === 0 ? (
              <div className="panel">
                <p>No projects are saved in this browser.</p>
                <button
                  type="button"
                  className="button quiet"
                  onClick={() => void restoreExample().then((project) => project && router.push(`/projects/${project.id}`))}
                >
                  Restore the Meri example
                </button>
              </div>
            ) : null}
            <ul className="project-list">
              {projects?.map((project) => (
                <li key={project.id}>
                  <Link className="project-link" href={`/projects/${project.id}`}>
                    <span className="row">
                      <strong>{project.name}</strong>
                      {project.example ? <span className="pill example">Example</span> : null}
                      <span className="pill">{project.activeStage}</span>
                    </span>
                    <span className="meta">{excerpt(project.purpose, 140)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section style={{ marginTop: "2rem" }}>
          <h2>What a session does</h2>
          <ol className="steps">
            {STAGE_META.map((stage) => (
              <li key={stage.id}>
                <strong>
                  {stage.index} {stage.label}.
                </strong>{" "}
                {stage.purpose}
              </li>
            ))}
          </ol>
        </section>
        <footer className="footer-note muted">
          <p>
            Buildsense does not run your tests, read your repository, or certify a release. Projects stay on this
            device until a server database is configured. Nothing is marked verified because a model said so.
          </p>
        </footer>
      </main>
    </>
  );
}
