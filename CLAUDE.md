# starter-template

## What this project does
Reusable starter template for Next.js + Vercel + Supabase projects.

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

## Domain Concepts
[Replace with project-specific entities, business rules, etc.]

## Current State
[Replace with what's built and what's in progress]
