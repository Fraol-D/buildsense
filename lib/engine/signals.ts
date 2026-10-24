import type { Project } from "@/lib/domain/types";
import { answerOf, defersTrust, denies, isUnknownAnswer, knownText } from "@/lib/engine/text";

export interface Signals {
  multiUser: boolean;
  sensitiveData: boolean;
  payments: boolean;
  externalServices: boolean;
  usesAI: boolean;
  realtime: boolean;
  fileUpload: boolean;
  regulated: boolean;
  hasDataToStore: boolean;
  vagueScale: boolean;
  deniesStorage: boolean;
  deniesIntegrations: boolean;
}

export interface Contradiction {
  id: string;
  message: string;
  question: string;
  consequence: string;
}

export const SIGNAL_CHIPS: { key: keyof Signals; label: string }[] = [
  { key: "multiUser", label: "More than one person" },
  { key: "sensitiveData", label: "Sensitive or personal data" },
  { key: "payments", label: "Payments" },
  { key: "externalServices", label: "External service" },
  { key: "usesAI", label: "A model produces behavior" },
  { key: "realtime", label: "Live or voice interaction" },
  { key: "fileUpload", label: "Files are uploaded" },
  { key: "regulated", label: "Regulated data" },
];

function blob(project: Project): string {
  return [project.purpose, project.name, ...Object.values(project.interview.answers)].join("\n");
}

export function deriveSignals(project: Project): Signals {
  const text = blob(project);
  const users = answerOf(project.interview.answers, "users");
  const data = answerOf(project.interview.answers, "data");
  const integrations = answerOf(project.interview.answers, "integrations");
  const scale = answerOf(project.interview.answers, "scale");
  const dismissed = new Set(project.interview.dismissedSignals);

  const singleUser = /\b(just me|only me|myself alone|personal use|single[- ]user)\b/i.test(users);
  const multiUser =
    !singleUser &&
    /\b(customers?|clients?|teams?|employees|staff|callers?|businesses|organizations?|members?|accounts?|multiple users|other people|operators|tenants?)\b/i.test(
      text,
    );

  const deniesStorage = Boolean(data) && !isUnknownAnswer(data) && denies(data);
  const deniesIntegrations =
    Boolean(integrations) && !isUnknownAnswer(integrations) && denies(integrations);
  const namesProvider = /\b(twilio|stripe|slack|webhook|s3|oauth|supabase|openai|telephony|sendgrid|github api)\b/i.test(
    text,
  );

  const signals: Signals = {
    multiUser,
    sensitiveData:
      /\b(health|medical|patient|payment|credit card|card number|voice|recording|transcript|email|phone|address|ssn|passport|financial|children|minors|location|password)\b/i.test(
        text,
      ),
    payments:
      /\b(payment|stripe|billing|subscription|checkout|invoice|credit card)\b/i.test(text) &&
      !/\b(no payments?|without payments?|not (?:handling )?payments?)\b/i.test(text),
    externalServices: (!deniesIntegrations && /\b(api|webhook|third[- ]party|integration)\b/i.test(text)) || namesProvider,
    usesAI:
      /\b(llm|gpt|claude|grok|speech[- ]to[- ]text|transcri(?:be|ption|bed)|generative ai|\bai\b|language model)\b/i.test(
        text,
      ),
    realtime: /\b(realtime|real-time|websocket|live call|phone call|inbound call|voice)\b/i.test(text),
    fileUpload: /\b(upload|attachment|pdf|image files|files)\b/i.test(text),
    regulated: /\b(hipaa|gdpr|pci|sox|ferpa|coppa)\b/i.test(text),
    hasDataToStore: Boolean(knownText(data)) && !deniesStorage,
    vagueScale:
      /\b(millions|web scale|infinitely scalable|highly scalable|planet scale)\b/i.test(scale) &&
      !/\d/.test(scale),
    deniesStorage,
    deniesIntegrations,
  };

  for (const chip of SIGNAL_CHIPS) {
    if (dismissed.has(chip.key)) signals[chip.key] = false;
  }
  return signals;
}

export function findContradictions(project: Project): Contradiction[] {
  const signals = deriveSignals(project);
  const answers = project.interview.answers;
  const journey = answerOf(answers, "journey");
  const auth = `${answerOf(answers, "auth")} ${answerOf(answers, "constraints")}`;
  const constraints = answerOf(answers, "constraints");
  const scale = answerOf(answers, "scale");
  const found: Contradiction[] = [];

  if ((signals.sensitiveData || signals.multiUser || signals.payments) && defersTrust(auth)) {
    found.push({
      id: "auth-deferred",
      message:
        "You described other people's data, or a shared product, and also said identity can wait. Those two statements disagree. A later login does not protect records you store now.",
      question: "Who is allowed to read and change each stored record in the first version, and what is rejected without that check?",
      consequence:
        "If this stays unresolved, an implementation can ship with stored personal data and no real authorization boundary.",
    });
  }

  if (signals.deniesStorage && /\b(save|store|history|account|remember|log|transcript)\b/i.test(journey)) {
    found.push({
      id: "stateless-but-saves",
      message:
        "The data answer says nothing is stored, but the primary path describes saving or remembering something. One of those has to give.",
      question: "Which records, if any, must still exist after the session ends?",
      consequence: "The data model and the primary path will be built against different assumptions.",
    });
  }

  if (
    signals.deniesIntegrations &&
    /\b(twilio|stripe|slack|webhook|s3|oauth|telephony|sendgrid)\b/i.test(
      [project.purpose, journey, answerOf(answers, "failures")].join("\n"),
    )
  ) {
    found.push({
      id: "no-integration-but-names-one",
      message:
        "The integration answer says there is no external service, but another answer names one. The failure behavior depends on which statement is true.",
      question: "Which external service is actually in the first version, if any?",
      consequence: "A brief can either omit a real dependency or invent one that was declined.",
    });
  }

  if (
    (signals.vagueScale || /\bmillions\b/i.test(scale)) &&
    /\b(hackathon|this weekend|today|tomorrow|one day|two days|48 hours)\b/i.test(constraints)
  ) {
    found.push({
      id: "scale-vs-time",
      message:
        "The scale language and the time constraint pull in different directions. The first version needs a load it will actually be built and checked for.",
      question: "What load must the first version survive, stated as a number you are willing to test?",
      consequence: "Otherwise the design grows production machinery that will not be verified.",
    });
  }

  return found;
}
