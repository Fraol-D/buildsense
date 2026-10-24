# Buildsense decisions

## Product

Buildsense is an engineering coach for people building software with coding agents. It is not a task board. The product keeps four things separate:

- What the user stated.
- What the coach recommends.
- What the user approved.
- What evidence actually shows.

A requirement is not verified because an agent said it was implemented, because the project compiles, or because a checklist was generated.

## Local-first persistence

No database credentials were available. Projects are stored in IndexedDB in the browser, with a localStorage mirror if IndexedDB is unavailable. The repository lives in `lib/persistence/repository.ts` so a server database can replace it later without changing the coaching engine.

Limitation: a project does not leave the browser. Clearing site data deletes it. There is no account and no sync.

The Meri example is seeded once. Deleting it does not bring it back until the user restores it. Its evidence is hand-written and labeled illustrative.

## Coaching engine

The interview, problem definition, decisions, briefs, verification, and release record are deterministic TypeScript. They work with no model. The engine refuses to invent critical requirements: unknown access rules, unknown failure behavior, and unknown outcomes stay open questions. Inferred proposals stay proposed until the user accepts them.

Decisions stay recommendations until approved. A simple project gets one or two decisions, not a distributed architecture.

Verification status is set only by the user, and only after evidence is recorded. Insufficient evidence cannot be marked verified unless the user acknowledges the override. That override stays visible and blocks a clean release record for serious checks.

Release readiness is one of four named judgments. There is no confidence score.

## Model critique

When `XAI_API_KEY` is set, `/api/coach` calls the xAI API (`https://api.x.ai/v1/chat/completions`) with model `grok-4.7` unless `XAI_MODEL` overrides it. The key stays on the server. Output must match a JSON schema and is validated with Zod before it reaches the client. Suggestions are added to the record only when the user accepts them, and they are labeled as model critique rather than facts.

If the key is missing, the route returns 503 and the interface says critique is off. The app does not imitate a model response.

## Stack

Next.js App Router, React, TypeScript, and Tailwind CSS. Cache Components are enabled by the app template. Project pages pass dynamic `params` into a Suspense boundary and read them in a client workspace, because project data lives in the browser.
