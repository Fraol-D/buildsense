import { SCHEMA_VERSION, type Project } from "@/lib/domain/types";

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<Project>;
  return (
    record.schemaVersion === SCHEMA_VERSION &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.purpose === "string" &&
    typeof record.example === "boolean" &&
    !!record.interview &&
    Array.isArray(record.interview.messages) &&
    Array.isArray(record.interview.dismissedSignals) &&
    Array.isArray(record.decisions) &&
    Array.isArray(record.briefs) &&
    Array.isArray(record.verification) &&
    Array.isArray(record.evidence) &&
    Array.isArray(record.lessons)
  );
}
