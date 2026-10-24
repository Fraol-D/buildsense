import type { ActionResult, EngineOptions, Project } from "@/lib/domain/types";

export function nowIso(options?: EngineOptions): string {
  return options?.now ?? new Date().toISOString();
}

export function makeId(prefix: string, options?: EngineOptions): string {
  const raw = options?.id ? options.id() : crypto.randomUUID();
  return `${prefix}_${raw}`;
}

export function touch(project: Project, options?: EngineOptions): Project {
  return { ...project, updatedAt: nowIso(options) };
}

export function ok(project: Project, options?: EngineOptions): ActionResult {
  return { ok: true, project: touch(project, options) };
}

export function fail(project: Project, error: string): ActionResult {
  return { ok: false, error, project };
}
