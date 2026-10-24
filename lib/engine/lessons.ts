import type { EngineOptions, Lesson, Project } from "@/lib/domain/types";
import { makeId, nowIso } from "@/lib/engine/id";

interface LessonDraft {
  key: string;
  title: string;
  context: string;
  explanation: string;
  principle: string;
  deeper: string;
}

export function addLesson(project: Project, draft: LessonDraft, options?: EngineOptions): Project {
  if (project.lessons.some((lesson) => lesson.key === draft.key)) return project;
  const lesson: Lesson = {
    ...draft,
    id: makeId("les", options),
    modelNote: null,
    createdAt: nowIso(options),
  };
  return { ...project, lessons: [...project.lessons, lesson] };
}

export function attachModelNote(project: Project, lessonId: string, note: string): Project {
  return {
    ...project,
    lessons: project.lessons.map((lesson) =>
      lesson.id === lessonId
        ? {
            ...lesson,
            modelNote: note.trim(),
          }
        : lesson,
    ),
  };
}
