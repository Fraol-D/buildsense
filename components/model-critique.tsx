"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain/types";
import type { CoachTask, Critique } from "@/lib/engine/critique";
import { applyCritiqueSuggestion, buildCritiqueContext } from "@/lib/engine/critique";
import { insertProbe } from "@/lib/engine/interview";
import { useModelStatus } from "@/lib/model-status";
import { Banner } from "@/components/ui";

export function ModelCritique({
  project,
  task,
  onChange,
}: {
  project: Project;
  task: CoachTask;
  onChange: (project: Project) => void;
}) {
  const { status, error } = useModelStatus();
  const [critique, setCritique] = useState<Critique | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function ask() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, context: buildCritiqueContext(project, task) }),
      });
      const body = (await response.json()) as {
        error?: string;
        message?: string;
        critique?: Critique;
      };
      if (!response.ok || !body.critique) {
        setCritique(null);
        setMessage(body.message ?? "The model critique did not return anything usable. Nothing was changed.");
        return;
      }
      setCritique(body.critique);
    } catch {
      setMessage("The critique request failed. Nothing was changed.");
    } finally {
      setPending(false);
    }
  }

  if (error) return <Banner tone="warn">{error}</Banner>;
  if (!status) return <p className="meta">Checking whether model critique is configured…</p>;
  if (!status.modelConfigured) {
    return (
      <p className="meta">
        Model critique is off. Set <span className="mono">GEMINI_API_KEY</span> on the server if you want a second
        opinion. The workflow on this page does not use a model.
      </p>
    );
  }

  return (
    <section className="stack">
      <div className="action-row">
        <button type="button" className="button quiet" onClick={() => void ask()} disabled={pending}>
          {pending ? "Asking the model…" : `Ask ${status.model} to critique`}
        </button>
        <span className="meta">A critique is not a requirement and it is not evidence.</span>
      </div>
      {message ? <Banner tone="warn">{message}</Banner> : null}
      {critique ? (
        <div className="stack">
          <p className="coach">{critique.commentary}</p>
          {critique.suggestions.map((suggestion) => (
            <article key={`${suggestion.kind}:${suggestion.text}`} className="option">
              <p className="kicker">
                {suggestion.kind} · {suggestion.impact}
              </p>
              <p>{suggestion.text}</p>
              <p className="meta">{suggestion.why}</p>
              <button
                type="button"
                className="button quiet"
                onClick={() => {
                  if (task === "probe" && suggestion.kind === "probe") {
                    const result = insertProbe(project, suggestion.text);
                    if (!result.ok) {
                      setMessage(result.error);
                      return;
                    }
                    onChange(result.project);
                    return;
                  }
                  const result = applyCritiqueSuggestion(project, suggestion);
                  if (!result.ok) {
                    setMessage(result.error);
                    return;
                  }
                  onChange(result.project);
                }}
              >
                {task === "probe" && suggestion.kind === "probe" ? "Ask this probe" : "Add to the record"}
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
