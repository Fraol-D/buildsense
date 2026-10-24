# Buildsense

Buildsense is an engineering coach for people who build software with coding agents.

It walks one project through a discovery interview, a problem definition, explicit engineering decisions, copyable instructions for an external agent, a requirement-linked verification plan, and a release record. Generated code is not treated as correctness.

## What works without configuration

- Create a project and keep it in this browser across refreshes.
- Answer an adaptive discovery interview, including “I don’t know.”
- Edit requirements, assumptions, constraints, and open questions.
- Review recommendations, compare options, and approve or revise decisions.
- Copy bounded implementation briefs, including correction briefs after a failed check.
- Record evidence and set a check to verified, failed, unverified, or blocked.
- Read a release record that names failures and unverified high-impact work.

An example project, Meri, is created on the first visit. Its evidence is illustrative and was not produced by running tests.

## What does not work until you configure it

Model critique is off until you set a server-side API key. The rest of the product does not call a model and does not invent model replies.

Buildsense does not run tests, read a repository, or inspect a deployment. It will not mark a requirement verified because an agent said the work was done.

## Persistence

Projects are stored in this browser (IndexedDB, with a localStorage mirror). They are not synced to an account. Clearing site data deletes them. The storage boundary is isolated in `lib/persistence/repository.ts`.

## Setup

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Optional model critique:

```bash
cp .env.example .env.local
```

Set `XAI_API_KEY` in `.env.local`. Restart the dev server. The default model is `grok-4.7`. Override it with `XAI_MODEL` if needed. The key is read only on the server.

## Scripts

- `npm run dev` — local app
- `npm run test` — coaching-engine tests
- `npm run typecheck` — TypeScript
- `npm run lint` — ESLint
- `npm run build` — production build

## Further reading

Product and architecture choices are in [docs/decisions.md](docs/decisions.md).
