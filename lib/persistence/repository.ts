import { isProject } from "@/lib/domain/guards";
import type { Project } from "@/lib/domain/types";
import { createExampleProject, EXAMPLE_PROJECT_ID } from "@/lib/sample/meri";

const DB_NAME = "buildsense";
const STORE = "projects";
const LOCAL_KEY = "buildsense.projects.v1";
const SEED_KEY = "buildsense.seeded";

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) {
        database.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function readMirror(): Project[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProject);
  } catch {
    return [];
  }
}

function writeMirror(projects: Project[]) {
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(projects));
}

function upsert(projects: Project[], project: Project): Project[] {
  const exists = projects.some((item) => item.id === project.id);
  return exists ? projects.map((item) => (item.id === project.id ? project : item)) : [project, ...projects];
}

async function readIdb(): Promise<Project[]> {
  const database = await openDb();
  try {
    const transaction = database.transaction(STORE, "readonly");
    const records = await requestToPromise(transaction.objectStore(STORE).getAll());
    return (records as unknown[]).filter(isProject);
  } finally {
    database.close();
  }
}

async function writeIdb(project: Project): Promise<void> {
  const database = await openDb();
  try {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put(project);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The project could not be saved."));
    });
  } finally {
    database.close();
  }
}

async function deleteIdb(id: string): Promise<void> {
  const database = await openDb();
  try {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("The project could not be deleted."));
    });
  } finally {
    database.close();
  }
}

async function maybeSeed(projects: Project[]): Promise<Project[]> {
  if (projects.length > 0 || window.localStorage.getItem(SEED_KEY) === "1") return projects;
  const example = createExampleProject();
  window.localStorage.setItem(SEED_KEY, "1");
  try {
    await writeIdb(example);
  } catch {
    // The caller still receives the example and can mirror it.
  }
  writeMirror([example]);
  return [example];
}

export async function loadProjects(): Promise<Project[]> {
  return enqueue(async () => {
    try {
      const projects = await maybeSeed(await readIdb());
      writeMirror(projects);
      return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    } catch {
      const projects = await maybeSeed(readMirror());
      writeMirror(projects);
      return projects.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
  });
}

export async function saveProject(project: Project): Promise<void> {
  return enqueue(async () => {
    const mirrored = upsert(readMirror(), project);
    try {
      writeMirror(mirrored);
    } catch {
      throw new Error("This browser refused to store the project. Free some site storage and try again.");
    }
    try {
      await writeIdb(project);
    } catch {
      // The localStorage mirror still has the project. IndexedDB can fail in private windows.
    }
  });
}

export async function deleteProject(id: string): Promise<void> {
  return enqueue(async () => {
    if (id === EXAMPLE_PROJECT_ID) window.localStorage.setItem(SEED_KEY, "1");
    writeMirror(readMirror().filter((project) => project.id !== id));
    try {
      await deleteIdb(id);
    } catch {
      // The mirror is already updated.
    }
  });
}

export async function restoreExampleProject(): Promise<Project> {
  const example = createExampleProject();
  await saveProject(example);
  return example;
}
