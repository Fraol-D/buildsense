import type { Appraisal, EvidenceKind, VerificationItem } from "@/lib/domain/types";

const OUTPUT_SIGNAL =
  /(\bPASS\b|\bFAIL\b|\bFAILED\b|AssertionError|Error:|Exception|Traceback|^\s*(?:✓|✔|✗|×|not ok|ok \d+)|\b\d+ (?:passing|failing)\b|@@ |exit code|HTTP\/\d|\bstatus(?: code)?:\s*\d{3})/im;

const FAILURE_SIGNAL =
  /(\bFAIL\b|\bFAILED\b|AssertionError|Traceback|Exception|\bError:|not ok|✗|×|\b[1-9]\d* failing\b|exit code (?!0\b)\d+)/im;

const CLAIM_SIGNAL =
  /\b(all tests pass(?:ed)?|it works|works fine|implemented successfully|looks good|lgtm|\bdone\b|feature is complete|i tested it|manually tested|the agent (?:said|says|implemented))\b/i;

export function appraiseEvidence(body: string, item: Pick<VerificationItem, "expected" | "title">): Appraisal {
  const text = body.trim();
  if (text.length < 40) {
    return {
      label: "insufficient",
      explanation:
        "There is not enough recorded evidence to evaluate the claim. A short assurance is not an observation of the required behavior.",
    };
  }
  const hasOutput = OUTPUT_SIGNAL.test(text);
  const hasFailure = FAILURE_SIGNAL.test(text);
  if (!hasOutput && CLAIM_SIGNAL.test(text)) {
    return {
      label: "insufficient",
      explanation:
        "This reads as a claim that the work is finished. Buildsense does not treat an agent's summary, or a person's summary of an agent, as evidence that the requirement is met.",
    };
  }
  if (!hasOutput) {
    return {
      label: "insufficient",
      explanation: `This does not contain test output, a log of the failing or passing check, a diff of the exercised behavior, or an error from running “${item.title}”. A description of intent is not evidence.`,
    };
  }
  if (hasFailure) {
    return {
      label: "suggests_failure",
      explanation:
        "The evidence contains a failure signal. Read the output against the expected result before choosing a status. Passing lines elsewhere in the paste do not cancel a failure.",
    };
  }
  const expectedWords = significantWords(item.expected);
  const overlap = expectedWords.filter((word) => text.toLowerCase().includes(word));
  if (overlap.length === 0) {
    return {
      label: "appears_relevant",
      explanation:
        "This contains output, but it does not obviously exercise the expected result for this check. Read it before you choose a status. Output alone does not mark the requirement verified.",
    };
  }
  return {
    label: "appears_relevant",
    explanation:
      "This contains output that appears related to the expected result. It still does not establish requirements, cases, or security properties that the output does not show. You choose the status. Buildsense will not mark it verified for you.",
  };
}

function significantWords(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 5 && !STOP.has(word)),
    ),
  ).slice(0, 12);
}

const STOP = new Set([
  "should",
  "before",
  "after",
  "without",
  "through",
  "requirement",
  "expected",
  "system",
  "record",
]);

export function supportedCause(body: string): string | null {
  const contrasted = body.match(/expected:?\s+(.{3,180}?)\s+received:?\s+(.{3,180})/i);
  if (contrasted) {
    return `The recorded output contrasts an expected value (“${clean(contrasted[1])}”) with a received value (“${clean(contrasted[2])}”).`;
  }
  const assertion = body.match(/AssertionError:?\s+([^\n]{3,200})/i);
  if (assertion) return `An assertion failed with this message: ${clean(assertion[1])}.`;
  const error = body.match(/^(?:Error|TypeError|ReferenceError):\s+([^\n]{3,200})/m);
  if (error) return `The output includes an error: ${clean(error[1])}.`;
  return null;
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export const EVIDENCE_KINDS: { id: EvidenceKind; label: string }[] = [
  { id: "test_output", label: "Test output" },
  { id: "log", label: "Log" },
  { id: "diff", label: "Diff or implementation excerpt" },
  { id: "summary", label: "Summary of what was run" },
  { id: "other", label: "Other evidence" },
];
