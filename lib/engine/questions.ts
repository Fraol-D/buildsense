import type { Signals } from "@/lib/engine/signals";
import { isVagueJourney, isVagueObservable } from "@/lib/engine/text";

export interface DiscoveryContext {
  purpose: string;
  answers: Record<string, string>;
  signals: Signals;
}

export interface CoachQuestion {
  id: string;
  prompt: string;
  why: string;
  placeholder: string;
  suggestions?: string[];
  unknownGuidance: string;
  include: (context: DiscoveryContext) => boolean;
  challenge?: (answer: string, context: DiscoveryContext) => string | null;
}

export const QUESTIONS: CoachQuestion[] = [
  {
    id: "outcome",
    prompt:
      "What should a person be able to finish with this software that they cannot reliably finish today?",
    why: "The outcome is the requirement everything else has to serve. A feature list is not an outcome.",
    placeholder: "Name the finished result, not the technology.",
    unknownGuidance:
      "That is a fair answer. The available move is to describe one concrete situation you have actually seen, including what the person wanted at the end. Until that exists, I will not invent the product's purpose.",
    include: () => true,
  },
  {
    id: "users",
    prompt: "Who has that problem, and in what situation do they hit it?",
    why: "A product for 'users' hides whose data, permissions, and failure matter.",
    placeholder: "Be specific about the person and the moment.",
    suggestions: ["Just me, on my own machine", "I don't know"],
    unknownGuidance:
      "If you do not know who it is for, the authorization and data rules are guesses. You can continue, and I will keep 'who this is for' as an open question with high impact.",
    include: () => true,
  },
  {
    id: "journey",
    prompt:
      "Describe the primary path, in order. Start when the person begins and stop when the outcome is done. Include what the person does and what the software does.",
    why: "Implementation briefs fall apart when the path is a slogan. Steps give the acceptance criteria something to point at.",
    placeholder: "1. …\n2. …\n3. …",
    unknownGuidance:
      "Without a path, I can still record the outcome, but I cannot honestly write a behavioral requirement for how it happens. That gap will stay open.",
    include: () => true,
    challenge: (answer) =>
      isVagueJourney(answer)
        ? "That names a category, not a workflow. Write ordered steps: what the person does, what the software does, and what is true at the end of each step."
        : null,
  },
  {
    id: "observable",
    prompt:
      "What would you observe if this worked? Describe a check a person could perform, not a feeling about the product.",
    why: "If you cannot say what would be observed, you cannot later tell a passing demo from a met requirement.",
    placeholder: "What record, message, screen, or rejection would you point at?",
    unknownGuidance:
      "Then the success check is unknown. I will not replace it with 'it works'. Verification will stay blocked on this until you name an observation.",
    include: () => true,
    challenge: (answer) =>
      isVagueObservable(answer)
        ? "Words like fast, easy, or modern are preferences until they name an observation. What would someone see, receive, or be refused?"
        : null,
  },
  {
    id: "non_goals",
    prompt: "What will the first version deliberately not do?",
    why: "Exclusions are how a brief stops a coding agent from inventing a second product.",
    placeholder: "Name the tempting work that is out of scope.",
    suggestions: ["No payments", "No team accounts", "I don't know"],
    unknownGuidance:
      "Leaving scope unbounded is itself a risk. I will record that the first version's exclusions are undecided, and briefs will say not to invent extra features.",
    include: () => true,
  },
  {
    id: "data",
    prompt:
      "What must the software remember after the session ends? For each kind of information, who is allowed to read or change it?",
    why: "Storage without an access rule becomes an integrity and privacy gap, not a schema.",
    placeholder: "Records, who owns them, and who must not see them. Or say that nothing is stored.",
    suggestions: ["Nothing is stored", "I don't know"],
    unknownGuidance:
      "Three real choices: store nothing, store it only on this person's device, or store it where the software can enforce who reads it. Saying you do not know keeps this as a high-impact question. I will not pick a database for you in the meantime.",
    include: () => true,
  },
  {
    id: "integrations",
    prompt:
      "Name every external service, API, device, or existing tool the first version must talk to. If it talks to nothing, say that.",
    why: "Each dependency adds a failure path the implementation has to specify.",
    placeholder: "Name the system and what crosses the boundary. Or say none.",
    suggestions: ["No external services", "I don't know"],
    unknownGuidance:
      "Unknown dependencies stay out of the requirements. A brief must not add an integration in order to seem complete.",
    include: () => true,
  },
  {
    id: "auth",
    prompt:
      "How should the software decide who someone is, and what they are allowed to do? If two people are involved, what must one of them be unable to do?",
    why: "Identity is not the same as authorization. The second part is the requirement that prevents one person from reading another's data.",
    placeholder: "State the rule that should be rejected when it is broken.",
    unknownGuidance:
      "You can defer a login screen only if the first version stores nothing shared or sensitive. If it does, 'later' is an untested assumption, and I will keep the authorization rule as an open question rather than pretending it exists.",
    include: (context) =>
      context.signals.multiUser ||
      context.signals.sensitiveData ||
      context.signals.payments ||
      context.signals.regulated,
    challenge: (answer, context) => {
      const deferring = /\b(later|not now|no auth|without login|skip)\b/i.test(answer);
      if (deferring && (context.signals.sensitiveData || context.signals.payments || context.signals.multiUser)) {
        return "Deferring identity conflicts with the data you described. What, specifically, must be impossible for the wrong person in the first version?";
      }
      return null;
    },
  },
  {
    id: "ai_boundary",
    prompt:
      "Where does a model sit in the workflow? What may it produce, and what must a person or a deterministic check confirm before that output changes stored data or reaches another person?",
    why: "Model output is a draft until something else accepts it. That boundary belongs in the requirements, not in a hope that the prompt is good.",
    placeholder: "Say what the model may draft and what is allowed to commit it.",
    unknownGuidance:
      "The usual choices are: the model only drafts and a person commits; the model commits a low-impact change that can be undone; or the model commits directly. Direct commit is a poor fit when the output affects another person, money, or a record you cannot easily repair. I will not silently choose one.",
    include: (context) => context.signals.usesAI,
  },
  {
    id: "failures",
    prompt:
      "When the most important dependency is down, slow, or wrong, what should the person see, and what must not be saved or sent?",
    why: "The failure path is part of the behavior. A happy path requirement hides data corruption and false success.",
    placeholder: "Name the failure and the state that must remain false.",
    unknownGuidance:
      "If you do not know, a conservative default is: keep the person's input, do not record success, and show a specific error. That is a proposal you can accept later. It is not yet a requirement.",
    include: (context) =>
      context.signals.externalServices ||
      context.signals.usesAI ||
      context.signals.realtime ||
      context.signals.payments,
  },
  {
    id: "constraints",
    prompt:
      "Which limits are real: deadline, budget, platform, an existing codebase, team skills, or a legal rule? Separate those from preferences.",
    why: "A preference can be traded away. A real constraint changes the design.",
    placeholder: "Label each item as a limit or a preference.",
    suggestions: ["I don't know"],
    unknownGuidance:
      "No hard constraint is recorded. I will not upgrade words like modern, scalable, or simple into requirements.",
    include: () => true,
  },
  {
    id: "scale",
    prompt:
      "What load must the first version survive, and is that a measurement or a hope? One person, a small team, hundreds of people, or something else?",
    why: "Scale language often smuggles in an architecture the project will not verify.",
    placeholder: "Give a number or a band, and say whether you measured it.",
    suggestions: ["One person", "A small team, under 20", "I don't know"],
    unknownGuidance:
      "Unknown load stays an assumption. I will not recommend a distributed system to cover an unnamed scale.",
    include: () => true,
    challenge: (answer) =>
      /\b(millions|web scale|infinitely|highly scalable|planet)\b/i.test(answer) && !/\d/.test(answer)
        ? "That is a hope, not a load. What number should the first version be tested against, and what is explicitly not required yet?"
        : null,
  },
  {
    id: "uncertainties",
    prompt:
      "What are you least sure about? Separate what you have seen happen from what you are guessing.",
    why: "Named uncertainty is useful. Unnamed uncertainty becomes a requirement the implementation pretends is settled.",
    placeholder: "Seen: …\nGuessing: …",
    suggestions: ["I don't know"],
    unknownGuidance:
      "If nothing is uncertain, say that explicitly. I will still flag gaps that your earlier answers left open.",
    include: () => true,
  },
];

export function questionById(id: string): CoachQuestion | undefined {
  return QUESTIONS.find((question) => question.id === id);
}

export const DRAFT_QUESTION_IDS = ["outcome", "users", "journey", "observable"] as const;
