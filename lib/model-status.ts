"use client";

import { useEffect, useState } from "react";
import type { ModelStatus } from "@/lib/domain/types";

export function useModelStatus(): { status: ModelStatus | null; error: string | null } {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/status")
      .then(async (response) => {
        if (!response.ok) throw new Error("status failed");
        return (await response.json()) as ModelStatus;
      })
      .then((value) => {
        if (!cancelled) setStatus(value);
      })
      .catch(() => {
        if (!cancelled) setError("Model status could not be read. The rest of the workflow still works.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, error };
}
