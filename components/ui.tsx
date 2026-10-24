"use client";

import { useState, type ReactNode } from "react";

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad" | "good";
  children: ReactNode;
}) {
  return (
    <p className={`banner ${tone === "info" ? "" : tone}`} role={tone === "bad" ? "alert" : "status"}>
      {children}
    </p>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone?: string;
  children: ReactNode;
}) {
  return <span className={`pill ${tone ?? ""}`}>{children}</span>;
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Copied.");
    } catch {
      setMessage("Clipboard permission was denied. Select the text below and copy it manually.");
    }
  }

  return (
    <div className="action-row">
      <button type="button" className="copy" onClick={() => void copy()}>
        {label}
      </button>
      {message ? <span className="meta">{message}</span> : null}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
