export const SCHEMA_VERSION = 1 as const;

export const STAGES = [
  "discover",
  "define",
  "decide",
  "instruct",
  "verify",
  "release",
] as const;

export type Stage = (typeof STAGES)[number];

export type Impact = "high" | "medium" | "low";
export type RequirementOrigin = "stated" | "inferred";
export type RequirementStatus = "proposed" | "accepted" | "deferred" | "rejected";
export type RequirementKind = "functional" | "nonfunctional" | "constraint";
export type AssumptionStatus = "unreviewed" | "accepted" | "rejected";
export type DecisionStatus = "proposed" | "approved" | "revised";
export type BriefStatus = "draft" | "ready" | "handed-off";
export type VerificationStatus = "unverified" | "verified" | "failed" | "blocked";
export type Priority = "critical" | "high" | "medium" | "low";
export type EvidenceKind = "test_output" | "log" | "diff" | "summary" | "other";
export type AppraisalLabel = "insufficient" | "suggests_failure" | "appears_relevant";
export type ReleaseRecommendation =
  | "not_justified"
  | "critical_open"
  | "named_risks"
  | "no_critical_gaps";

export interface AcceptanceCriterion {
  id: string;
  statement: string;
}

export interface Requirement {
  id: string;
  key: string;
  title: string;
  statement: string;
  kind: RequirementKind;
  impact: Impact;
  origin: RequirementOrigin;
  status: RequirementStatus;
  acceptance: AcceptanceCriterion[];
  why: string;
}

export interface Assumption {
  id: string;
  statement: string;
  consequence: string;
  status: AssumptionStatus;
  origin: RequirementOrigin;
}

export interface OpenQuestion {
  id: string;
  question: string;
  impact: Impact;
  consequence: string;
  resolution: string | null;
}

export interface ProblemDefinition {
  summary: string;
  summaryEdited: boolean;
  users: string;
  outcome: string;
  journeys: string[];
  requirements: Requirement[];
  constraints: string[];
  assumptions: Assumption[];
  openQuestions: OpenQuestion[];
  exclusions: string[];
  contextNotes: string[];
  acceptedAt: string | null;
  unknownsAcknowledged: boolean;
  revision: number;
  answerFingerprint: string;
  edited: boolean;
}

export interface DecisionOption {
  id: string;
  name: string;
  summary: string;
  tradeoffs: string[];
  risks: string[];
}

export interface DecisionRevision {
  at: string;
  optionId: string;
  note: string;
}

export interface Decision {
  id: string;
  topic: string;
  title: string;
  problem: string;
  options: DecisionOption[];
  recommendedOptionId: string;
  recommendationRationale: string;
  reversalConditions: string;
  chosenOptionId: string | null;
  status: DecisionStatus;
  userNote: string;
  approvedAt: string | null;
  needsReview: boolean;
  reviewReason: string | null;
  basis: string;
  history: DecisionRevision[];
}

export interface ImplementationBrief {
  id: string;
  slice: string;
  title: string;
  objective: string;
  context: string;
  scope: string[];
  exclusions: string[];
  decisionLines: string[];
  requirementIds: string[];
  interfaces: string[];
  behavior: string[];
  acceptance: string[];
  edgeCases: string[];
  security: string[];
  tests: string[];
  evidenceRequired: string[];
  prerequisiteIds: string[];
  unresolved: string[];
  status: BriefStatus;
  markdown: string;
  sourceRevision: string;
  stale: boolean;
  staleReason: string | null;
  correctionForItemId: string | null;
}

export interface Appraisal {
  label: AppraisalLabel;
  explanation: string;
}

export interface Evidence {
  id: string;
  itemId: string;
  kind: EvidenceKind;
  body: string;
  note: string;
  submittedAt: string;
  illustrative: boolean;
  appraisal: Appraisal;
}

export interface StatusChange {
  at: string;
  status: VerificationStatus;
  note: string;
}

export interface VerificationItem {
  id: string;
  key: string;
  requirementId: string;
  title: string;
  risk: string;
  whyItMatters: string;
  method: string;
  expected: string;
  successEvidence: string;
  cannotEstablish: string;
  priority: Priority;
  priorityReason: string;
  status: VerificationStatus;
  finding: string;
  needsReview: boolean;
  reviewNote: string | null;
  orphaned: boolean;
  verifiedDespiteInsufficientEvidence: boolean;
  statementFingerprint: string;
  history: StatusChange[];
}

export interface Lesson {
  id: string;
  key: string;
  title: string;
  context: string;
  explanation: string;
  principle: string;
  deeper: string;
  modelNote: string | null;
  createdAt: string;
}

export interface InterviewMessage {
  id: string;
  role: "coach" | "user";
  kind: "question" | "challenge" | "guidance" | "answer" | "note";
  body: string;
  questionId?: string;
  at: string;
}

export interface PendingPrompt {
  questionId: string;
  prompt: string;
  mode: "challenge" | "probe";
}

export interface InterviewState {
  answers: Record<string, string>;
  challengesAsked: string[];
  contradictionsNoted: string[];
  pending: PendingPrompt | null;
  cursor: string | null;
  messages: InterviewMessage[];
  dismissedSignals: string[];
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  purpose: string;
  createdAt: string;
  updatedAt: string;
  example: boolean;
  activeStage: Stage;
  interview: InterviewState;
  definition: ProblemDefinition | null;
  decisions: Decision[];
  briefs: ImplementationBrief[];
  verification: VerificationItem[];
  evidence: Evidence[];
  lessons: Lesson[];
}

export interface EngineOptions {
  now?: string;
  id?: () => string;
  illustrativeEvidence?: boolean;
}

export type ActionResult =
  | { ok: true; project: Project }
  | { ok: false; error: string; project: Project };

export interface ModelStatus {
  persistence: "browser-local";
  modelConfigured: boolean;
  model: string | null;
  provider: "gemini";
}
