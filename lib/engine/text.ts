const UNKNOWN_ANSWERS = new Set([
  "i don't know",
  "i dont know",
  "idk",
  "not sure",
  "unknown",
  "tbd",
  "no idea",
  "unsure",
  "?",
  "n/a",
]);

export function isUnknownAnswer(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase().replace(/[.!]+$/g, "");
  return UNKNOWN_ANSWERS.has(normalized);
}

export function answerOf(answers: Record<string, string>, id: string): string {
  const followUp = answers[`${id}::challenge`]?.trim();
  if (followUp && !isUnknownAnswer(followUp)) return followUp;
  return answers[id]?.trim() ?? "";
}

export function knownText(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || isUnknownAnswer(trimmed)) return null;
  return trimmed;
}

export function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function excerpt(value: string, max = 180): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export function splitLines(value: string): string[] {
  return value
    .split(/\n+|(?<=\.)\s+(?=[A-Z])|;\s+/)
    .map((part) => part.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter((part) => part.length > 1);
}

export function splitSteps(value: string): string[] {
  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-*•\d.)]+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines;
  const parts = value
    .split(/\s+(?:→|->|then)\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 12);
  return parts.length >= 2 ? parts : [value.trim()].filter(Boolean);
}

export function fingerprint(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function isVagueJourney(value: string): boolean {
  if (isUnknownAnswer(value)) return false;
  const hasSequence =
    /\b(then|after|next|first|second|finally|when|step)\b/i.test(value) ||
    value.includes("\n") ||
    /\d+\./.test(value);
  return wordCount(value) < 25 || !hasSequence;
}

export function isVagueObservable(value: string): boolean {
  if (isUnknownAnswer(value)) return false;
  const feeling =
    /\b(happy|easy|seamless|intuitive|delightful|user-friendly|nice|fast|scalable|modern|clean|simple)\b/i.test(
      value,
    );
  const observable =
    /\b(see|shows|shown|saved|save|record|receives|returns|rejects|error|email|message|screen|list|status|database|log|transcript|created|sent)\b/i.test(
      value,
    );
  return (feeling && !observable) || wordCount(value) < 8;
}

export function defersTrust(value: string): boolean {
  return /\b(later|not now|skip auth|no auth|without auth|don't need auth|do not need auth|add login later|not yet|auth later|authentication later)\b/i.test(
    value,
  );
}

export function denies(value: string): boolean {
  return /\b(none|nothing|no external|no integrations?|nowhere|no services|doesn't integrate|does not integrate|no api|stateless|remember nothing|don't store|do not store|no data|won't store|will not store)\b/i.test(
    value,
  );
}

export function hasAccessLanguage(value: string): boolean {
  return /\b(only|owner|private|cannot|can't|allowed|admin|just me|myself|their own|each business|unauthorized|permission|may not|must not see|customers? can|user can)\b/i.test(
    value,
  );
}

export function isPreference(value: string): boolean {
  return /\b(prefer|preference|nice to have|ideally|would be nice|maybe|hopefully|if possible)\b/i.test(
    value,
  );
}

export function mentionsObligation(value: string): boolean {
  return /\b(must|save|store|send|confirm|reject|show|record|log|notify|charge|transcribe|create|refuse|prevent)\b/i.test(
    value,
  );
}
