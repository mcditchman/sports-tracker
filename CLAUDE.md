# sports-tracker

## What this project does
Sports tracking web app built on Next.js + Vercel + Supabase.

## Stack
- Next.js (App Router) on Vercel
- Supabase (Postgres + Auth + Storage)
- TypeScript
- Tailwind CSS

## Local Dev Commands
- `npm run dev` — start Next.js dev server (localhost:3000); restart it after editing `.env.local`
- `npm test` — vitest unit tests (pure logic in `src/lib/`; tests live in `tests/`)
- `supabase start` — start local Supabase stack (requires Docker)
- `supabase stop` — stop local Supabase stack
- `vercel env pull .env.local` — sync env vars from Vercel dashboard
- Manual ingestion: `GET /api/ingest?limit=N` with `Authorization: Bearer <CRON_SECRET>` (secret in `.env.local`)

## Database Conventions
- Migrations live in `supabase/migrations/`
- Generate new migrations via: `supabase db diff --use-migra -f migration_name`
- Never edit the DB directly in prod — always through migrations
- Apply migrations to remote: `supabase db push`
- If Docker isn't running, apply via the Supabase MCP `apply_migration` instead — then rename the local migration file to the version shown by `list_migrations` so `supabase db push` stays in sync
- Generate TypeScript types: `supabase gen types typescript --local > src/types/database.types.ts` (or MCP `generate_typescript_types` when Docker is down)
- PostgREST upserts (`onConflict`) can't target partial unique indexes — use `unique nulls not distinct (...)` constraints instead (see `stat_values`)

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
- Push to `master` (default branch) → Vercel auto-deploys to production
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

## Data Provider Gotchas (API-Football)
- Free plan: **seasons 2022–2024 only** (current season requires the $19/mo plan — change `API_FOOTBALL_SEASON` when upgrading), 100 req/day AND ~10 req/min
- The API returns HTTP 200 with an `errors` object for plan/auth problems and HTTP 429 for the per-minute limit; the adapter throws on both, and the ingest route stops its batch gracefully and reports `rateLimited: true`
- Ingest batches default to 40 stats calls/run with 6.5s spacing (~4.5 min, under the 300s function limit); one season backfill ≈ 8 daily cron runs

## Current State
Soccer MVP complete — PR #1 (https://github.com/mcditchman/sports-tracker/pull/1): schema live on remote Supabase, cron-protected `/api/ingest` (daily 06:00 UTC via vercel.json), trend dashboard at `/` (league → team → stat for/conceded → window/venue/opponent → chart + summary). Season pinned to `2024` (2024-25 PL) per free-tier limits; ~88/380 matches have stats, cron backfills the rest. Before prod fully works: set `API_FOOTBALL_KEY`, `API_FOOTBALL_SEASON=2024`, `CRON_SECRET` in Vercel env vars (values in local `.env.local`; Vercel CLI not installed/authenticated on this machine).
