"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { Project } from "@/lib/domain/types";
import { deleteProject, loadProjects, restoreExampleProject, saveProject } from "@/lib/persistence/repository";

interface Snapshot {
  projects: Project[] | null;
  error: string | null;
  saveError: string | null;
}

const serverSnapshot: Snapshot = { projects: null, error: null, saveError: null };
let snapshot: Snapshot = serverSnapshot;
const listeners = new Set<() => void>();
let loadStarted = false;
let epoch = 0;
const removedIds = new Set<string>();

function emit(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function mergeLoaded(loaded: Project[]): Project[] {
  const merged = new Map<string, Project>();
  for (const project of loaded) {
    if (!removedIds.has(project.id)) merged.set(project.id, project);
  }
  for (const project of snapshot.projects ?? []) merged.set(project.id, project);
  return [...merged.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function ensureLoaded() {
  if (loadStarted || typeof window === "undefined") return;
  loadStarted = true;
  const seen = epoch;
  void loadProjects()
    .then((projects) => {
      emit({
        projects: epoch === seen ? projects : mergeLoaded(projects),
        error: null,
        saveError: snapshot.saveError,
      });
    })
    .catch((error: unknown) => {
      if (snapshot.projects) return;
      emit({
        projects: null,
        error: error instanceof Error ? error.message : "Projects saved in this browser could not be read.",
        saveError: null,
      });
    });
}

export function useProjectStore() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => serverSnapshot);

  useEffect(() => {
    ensureLoaded();
  }, []);

  async function save(project: Project) {
    epoch += 1;
    removedIds.delete(project.id);
    const current = snapshot.projects ?? [];
    const projects = current.some((item) => item.id === project.id)
      ? current.map((item) => (item.id === project.id ? project : item))
      : [project, ...current];
    emit({ ...snapshot, projects, saveError: null });
    try {
      await saveProject(project);
    } catch (error) {
      emit({
        ...snapshot,
        projects,
        saveError:
          error instanceof Error
            ? error.message
            : "The change is on screen but was not saved. It may disappear when you refresh.",
      });
    }
  }

  async function remove(id: string) {
    epoch += 1;
    removedIds.add(id);
    const projects = (snapshot.projects ?? []).filter((project) => project.id !== id);
    emit({ ...snapshot, projects, saveError: null });
    try {
      await deleteProject(id);
    } catch (error) {
      emit({
        ...snapshot,
        saveError: error instanceof Error ? error.message : "The project could not be deleted from this browser.",
      });
    }
  }

  async function restoreExample() {
    try {
      const example = await restoreExampleProject();
      epoch += 1;
      removedIds.delete(example.id);
      const current = snapshot.projects ?? [];
      const projects = current.some((project) => project.id === example.id)
        ? current.map((project) => (project.id === example.id ? example : project))
        : [example, ...current];
      emit({ ...snapshot, projects, saveError: null });
      return example;
    } catch (error) {
      emit({
        ...snapshot,
        saveError: error instanceof Error ? error.message : "The example project could not be restored.",
      });
      return null;
    }
  }

  return { ...state, save, remove, restoreExample };
}
