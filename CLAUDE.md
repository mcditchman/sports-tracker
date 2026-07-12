# sports-tracker

## What this project does
Sports tracking web app built on Next.js + Vercel + Supabase.

## Stack
- Next.js (App Router) on Vercel
- Supabase (Postgres + Auth + Storage)
- TypeScript
- Tailwind CSS

## Local Dev Commands
- `npm run dev` — start Next.js dev server (localhost:3000)
- `supabase start` — start local Supabase stack (requires Docker)
- `supabase stop` — stop local Supabase stack
- `vercel env pull .env.local` — sync env vars from Vercel dashboard

## Database Conventions
- Migrations live in `supabase/migrations/`
- Generate new migrations via: `supabase db diff --use-migra -f migration_name`
- Never edit the DB directly in prod — always through migrations
- Apply migrations to remote: `supabase db push`
- Generate TypeScript types: `supabase gen types typescript --local > src/types/database.types.ts`

## Project Structure
- `src/app/` — pages and API routes (Next.js App Router)
- `src/app/api/` — serverless API routes
- `src/components/` — shared UI components
- `src/lib/supabase/` — Supabase client instances
- `src/types/` — TypeScript types (database.types.ts is generated, do not hand-edit)
- `supabase/migrations/` — all DB schema changes

## Code Conventions
- Use server components by default; client components only when needed (mark with 'use client')
- API routes go in `src/app/api/[route]/route.ts`
- Use the server Supabase client in server components and API routes
- Use the browser Supabase client in client components only

## Deployment
- Push to `main` → Vercel auto-deploys to production
- PRs and branches → Vercel generates preview deployment URLs automatically
- DB migrations must be run separately: `supabase db push`

## Infrastructure
- Supabase project: `sports-tracker` (ref: `aiojsyqokhcrwpekskim`, org: `wpmrhuaghwdbiabamxjx`, region: `us-east-1`)
- Vercel project: `sports-tracker` (id: `prj_7HeLmJ1zKqJpOXCAx2jec9m6xAeL`, team: `mcditchmans-projects`)
- GitHub repo: `https://github.com/mcditchman/sports-tracker`

## Domain Concepts
Sport-agnostic prop-research model (PRD: `docs/PRD_sports_props_research_tool.md`):
- `sports` → `leagues` → `teams` → `players` (players modeled but unused until player props ship)
- `matches` (two teams, league, season, kickoff, status) and `stat_types` (per sport: corners, shots, shots_on_target, fouls, yellow_cards, red_cards, possession)
- `stat_values` stores each team's own per-match value only; "conceded" stats are derived at query time from the opponent's row (`perspective: 'against'` in `src/lib/queries/trends.ts`)
- Provider adapter pattern: `src/lib/providers/types.ts` defines the interface; `src/lib/providers/api-football/` is the only adapter. New sports/providers = new adapter + stat_type rows, no schema changes.
- Missing stat values are excluded from averages (never treated as zero); no odds or betting data anywhere.

## Current State
Soccer MVP implemented (branch `feature/soccer-props-mvp`): schema migration applied to remote Supabase, cron-protected `/api/ingest` route (daily at 06:00 UTC via vercel.json, batches ≤80 stats calls/run to fit API-Football's 100 req/day free tier — full-season backfill takes ~5 daily runs), and the trend dashboard at `/` (league → team → stat → window/venue/opponent → chart + summary). Tests: `npm test` (vitest). Env needs `API_FOOTBALL_KEY`, `API_FOOTBALL_SEASON`, `CRON_SECRET` in addition to the Supabase vars.
