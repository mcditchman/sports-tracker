# sports-tracker

A sport-agnostic prop-research tool: ingests team match stats (corners, shots, cards, etc.) from a provider API and surfaces trend dashboards (e.g. "average corners for/against, home vs away, last N matches").

Soccer MVP is live — see [`CLAUDE.md`](./CLAUDE.md) "Current State" for status, and [`docs/PRD_sports_props_research_tool.md`](./docs/PRD_sports_props_research_tool.md) for the product spec.

## Stack

- [Next.js](https://nextjs.org) (App Router) on Vercel
- [Supabase](https://supabase.com) (Postgres + Auth + Storage)
- TypeScript, Tailwind CSS

## Getting Started

```bash
npm install
npm run dev       # start Next.js dev server at http://localhost:3000
npm test          # run vitest unit tests
```

`supabase start` / `supabase stop` run the local Supabase stack (requires Docker). Copy env vars with `vercel env pull .env.local`; restart `npm run dev` after editing `.env.local`.

See [`CLAUDE.md`](./CLAUDE.md) for full local dev commands, database conventions, project structure, and data provider gotchas.

## Deployment

Push to `master` auto-deploys to production via Vercel; other branches get preview deployments. Database migrations must be applied separately (`supabase db push`).
