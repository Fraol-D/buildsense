"use client";

import { useState } from "react";
import type { BriefStatus, Project } from "@/lib/domain/types";
import { generateBriefs, refreshBrief, setBriefStatus } from "@/lib/engine/briefs";
import { Banner, CopyButton, Pill } from "@/components/ui";

const STATUS_HELP: Record<BriefStatus, string> = {
  draft: "Draft. Not yet handed to an agent.",
  ready: "Ready to copy. Still not evidence of implementation.",
  "handed-off": "Handed to an agent. That does not mean the work is correct.",
};

export function InstructStage({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(project.briefs[0]?.id ?? null);

  function commit(result: { ok: boolean; project: Project; error?: string }) {
    if (!result.ok) {
      setError(result.error ?? "The brief was not updated.");
      return;
    }
    setError(null);
    onChange(result.project);
  }

  return (
    <div className="stack">
      <div className="row">
        <button className="button" type="button" onClick={() => commit(generateBriefs(project))}>
          {project.briefs.length > 0 ? "Generate current drafts" : "Write implementation briefs"}
        </button>
        <p className="meta">Copy these into Claude Code, Cursor, Codex, or another agent. Buildsense does not run them.</p>
      </div>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {project.briefs.length === 0 ? <p>No briefs yet. Approve at least one decision, then generate a bounded instruction.</p> : null}
      {project.briefs.map((brief) => (
        <article key={brief.id} className="doc stack">
          <div className="row">
            <h2>{brief.title}</h2>
            <Pill tone={brief.status === "handed-off" ? "approved" : brief.status === "ready" ? "recommendation" : "proposed"}>
              {brief.status}
            </Pill>
            {brief.correctionForItemId ? <Pill tone="attention">Correction</Pill> : null}
            {brief.stale ? <Pill tone="attention">Stale</Pill> : null}
          </div>
          <p>{brief.objective}</p>
          <p className="meta">{STATUS_HELP[brief.status]}</p>
          {brief.staleReason ? <Banner tone="warn">{brief.staleReason}</Banner> : null}
          <div className="action-row">
            <button className="button quiet" type="button" onClick={() => setOpenId(openId === brief.id ? null : brief.id)}>
              {openId === brief.id ? "Hide brief" : "Read brief"}
            </button>
            <CopyButton value={brief.markdown} label="Copy brief" />
            <label className="field">
              <span>Status</span>
              <select
                value={brief.status}
                onChange={(event) => commit(setBriefStatus(project, brief.id, event.target.value as BriefStatus))}
              >
                <option value="draft">Draft</option>
                <option value="ready">Ready to copy</option>
                <option value="handed-off">Handed to an agent</option>
              </select>
            </label>
            {brief.stale && !brief.correctionForItemId ? (
              <button className="button quiet" type="button" onClick={() => commit(refreshBrief(project, brief.id))}>
                Replace with a current draft
              </button>
            ) : null}
          </div>
          {openId === brief.id ? <pre className="pre">{brief.markdown}</pre> : null}
        </article>
      ))}
    </div>
  );
}
