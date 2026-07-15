# Team-Centric Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single filter-everything homepage with a browse → team drill-down: `/` lists teams with data-coverage context, `/team/[teamId]` shows every stat type at a glance via tiles that drive one shared trend chart, and the player-page pattern is documented for a later pass once player-stat ingestion exists.

**Architecture:** No schema or migration changes. Two new query modules (`coverage.ts`, `team-summary.ts`) each pair a pure, unit-tested aggregation function with a thin Supabase-fetching wrapper, following the existing `assemble.ts` (pure) / `trends.ts` (wrapper) split. Two new lookups are added to the existing `lookups.ts`. Three new client components handle the URL-query-param-driven interactivity (league pick, stat-tile pick, window/venue/opponent filters) that the old single `TrendFilters` component used to own. `/team/[teamId]/page.tsx` composes all of it, reusing `getTrend`, `TrendChart`, `SummaryStats`, and `EmptyState` unchanged.

**Tech Stack:** Next.js 16 (App Router), Supabase (`@supabase/ssr`), TypeScript, Tailwind CSS 4, Recharts, Vitest.

## Global Constraints

- **No odds, no betting lines, no bet placement** anywhere in the UI (PRD §1, §4) — unchanged, not touched by this plan.
- **Missing stat values are excluded from averages, never treated as zero** (PRD §10.2) — applies to the new coverage and team-summary aggregations exactly as it already applies to `computeTrendSummary`.
- **Sport-agnostic naming** — no "soccer" in new file/function names (PRD §8.1).
- **Server components by default; client components only when needed** (CLAUDE.md) — only the three new interactive filter/selector components get `'use client'`.
- **No schema/migration changes, no player-stat ingestion, no visual redesign** in this pass — all explicitly out of scope per `docs/superpowers/specs/2026-07-15-team-pages-design.md`.
- **Pure logic lives in `src/lib/`, is unit-tested in `tests/`**; Supabase-touching query wrappers (`getTrend`, `getLeagues`, etc.) are not unit-tested today — this plan follows that existing convention for its new wrappers too.

**Before starting Task 1:** run `git diff vitest.config.ts`. The committed config has `include: ['tests/**/*.test.ts']`, but the working tree has an uncommitted, unrelated change pointing it at `include: ['src/**/*.test.ts']` instead — which would make `npm test` silently discover zero test files (including the three that already exist) rather than fail loudly. If that diff is still present, stop and ask the user how they want it handled before relying on any `npm test` output in this plan — do not revert it unilaterally, since it's pre-existing uncommitted work unrelated to this feature.

---

## File Structure

```
src/lib/queries/coverage.ts          # NEW: computeDataCoverage (pure) + getDataCoverage (Supabase wrapper)
src/lib/queries/team-summary.ts      # NEW: computeTeamStatSummary (pure) + getTeamStatSummary (Supabase wrapper)
src/lib/queries/lookups.ts           # MODIFIED: + getRoster, getTeamWithLeague
src/components/LeagueSelect.tsx      # NEW: client, league dropdown for browse page
src/components/StatTiles.tsx         # NEW: client, stat tile grid that selects {stat, perspective}
src/components/ChartFilters.tsx      # NEW: client, window/venue/opponent controls for team page
src/components/TrendFilters.tsx      # DELETED: fully replaced by the three components above
src/app/page.tsx                     # REWRITTEN: browse page (league select + team list + coverage)
src/app/team/[teamId]/page.tsx       # NEW: team overview (roster + stat tiles + shared chart)
tests/coverage.test.ts               # NEW
tests/team-summary.test.ts           # NEW
```

---

### Task 1: Data coverage aggregation

**Files:**
- Create: `src/lib/queries/coverage.ts`
- Test: `tests/coverage.test.ts`

**Interfaces:**
- Consumes: nothing new (uses `createClient` from `src/lib/supabase/server.ts`, already exists)
- Produces:
  - `computeDataCoverage(matches: {id: string; home_team_id: string; away_team_id: string}[], coverageRows: {match_id: string; team_id: string}[], teamIds: string[]): TeamCoverage[]`
  - `interface TeamCoverage { teamId: string; totalMatches: number; coveredMatches: number }`
  - `getDataCoverage(leagueId: string, teamIds: string[]): Promise<TeamCoverage[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/coverage.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeDataCoverage } from '../src/lib/queries/coverage'

const matches = [
  { id: 'm1', home_team_id: 'arsenal', away_team_id: 'chelsea' },
  { id: 'm2', home_team_id: 'spurs', away_team_id: 'arsenal' },
  { id: 'm3', home_team_id: 'arsenal', away_team_id: 'spurs' },
]

const coverageRows = [
  { match_id: 'm1', team_id: 'arsenal' },
  { match_id: 'm1', team_id: 'chelsea' },
  { match_id: 'm2', team_id: 'spurs' },
  // arsenal has no stat row for m2 -> not covered; m3 has no rows at all
]

describe('computeDataCoverage', () => {
  it('counts total matches and covered matches per team', () => {
    const result = computeDataCoverage(matches, coverageRows, ['arsenal', 'chelsea', 'spurs'])
    expect(result).toEqual([
      { teamId: 'arsenal', totalMatches: 3, coveredMatches: 1 },
      { teamId: 'chelsea', totalMatches: 1, coveredMatches: 1 },
      { teamId: 'spurs', totalMatches: 2, coveredMatches: 1 },
    ])
  })

  it('returns zero coverage for a team with no matches', () => {
    const result = computeDataCoverage(matches, coverageRows, ['everton'])
    expect(result).toEqual([{ teamId: 'everton', totalMatches: 0, coveredMatches: 0 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/coverage.test.ts`
Expected: FAIL — `src/lib/queries/coverage.ts` does not exist / `computeDataCoverage` is not exported.

- [ ] **Step 3: Write the implementation**

Create `src/lib/queries/coverage.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export interface TeamCoverage {
  teamId: string
  totalMatches: number
  coveredMatches: number
}

interface MatchPair {
  id: string
  home_team_id: string
  away_team_id: string
}

interface CoverageRow {
  match_id: string
  team_id: string
}

export function computeDataCoverage(
  matches: MatchPair[],
  coverageRows: CoverageRow[],
  teamIds: string[]
): TeamCoverage[] {
  const covered = new Set(coverageRows.map((r) => `${r.match_id}:${r.team_id}`))

  return teamIds.map((teamId) => {
    const teamMatches = matches.filter(
      (m) => m.home_team_id === teamId || m.away_team_id === teamId
    )
    const coveredMatches = teamMatches.filter((m) => covered.has(`${m.id}:${teamId}`)).length
    return { teamId, totalMatches: teamMatches.length, coveredMatches }
  })
}

export async function getDataCoverage(
  leagueId: string,
  teamIds: string[]
): Promise<TeamCoverage[]> {
  const supabase = await createClient()

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('league_id', leagueId)
  if (matchesError) throw matchesError
  if (!matches || matches.length === 0) {
    return teamIds.map((teamId) => ({ teamId, totalMatches: 0, coveredMatches: 0 }))
  }

  const { data: statValues, error: statError } = await supabase
    .from('stat_values')
    .select('match_id, team_id')
    .in(
      'match_id',
      matches.map((m) => m.id)
    )
    .is('player_id', null)
  if (statError) throw statError

  return computeDataCoverage(
    matches,
    (statValues ?? []).flatMap((s) =>
      s.team_id === null ? [] : [{ match_id: s.match_id, team_id: s.team_id }]
    ),
    teamIds
  )
}
```

Note: `getDataCoverage` deliberately does **not** filter matches by `status = 'finished'` — the denominator is every fixture in the season (matching the "88/380" framing already used in `CLAUDE.md`'s Current State notes), not just played ones. This is intentionally different from `getTrend`, which does filter to `status = 'finished'` because it computes an average that should only include played games.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/coverage.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/coverage.ts tests/coverage.test.ts
git commit -m "feat: add team data-coverage aggregation query"
```

---

### Task 2: Team stat summary aggregation

**Files:**
- Create: `src/lib/queries/team-summary.ts`
- Test: `tests/team-summary.test.ts`

**Interfaces:**
- Consumes: `createClient` from `src/lib/supabase/server.ts`
- Produces:
  - `computeTeamStatSummary(matches: {id: string; home_team_id: string; away_team_id: string}[], statValues: {match_id: string; team_id: string; stat_type_id: string; value: number}[], teamId: string, statTypeIds: string[]): TeamStatSummary[]`
  - `interface TeamStatSummary { statTypeId: string; forAverage: number | null; againstAverage: number | null }`
  - `getTeamStatSummary(teamId: string, statTypeIds: string[]): Promise<TeamStatSummary[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/team-summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeTeamStatSummary } from '../src/lib/queries/team-summary'

const matches = [
  { id: 'm1', home_team_id: 'arsenal', away_team_id: 'chelsea' },
  { id: 'm2', home_team_id: 'spurs', away_team_id: 'arsenal' },
]

const statValues = [
  { match_id: 'm1', team_id: 'arsenal', stat_type_id: 'corners', value: 8 },
  { match_id: 'm1', team_id: 'chelsea', stat_type_id: 'corners', value: 3 },
  { match_id: 'm2', team_id: 'spurs', stat_type_id: 'corners', value: 5 },
  // arsenal's corners value for m2 is missing -> excluded from 'for' average, not zero
  { match_id: 'm1', team_id: 'arsenal', stat_type_id: 'fouls', value: 10 },
]

describe('computeTeamStatSummary', () => {
  it('averages the team\'s own values for "for" and the opponents\' values for "against"', () => {
    const [corners] = computeTeamStatSummary(matches, statValues, 'arsenal', ['corners'])
    expect(corners.forAverage).toBe(8)
    expect(corners.againstAverage).toBeCloseTo((3 + 5) / 2)
  })

  it('returns null for a side with no recorded values, without affecting the other side', () => {
    const [fouls] = computeTeamStatSummary(matches, statValues, 'arsenal', ['fouls'])
    expect(fouls.forAverage).toBe(10)
    expect(fouls.againstAverage).toBeNull()
  })

  it('returns null averages for a stat type with no data at all', () => {
    const [unknown] = computeTeamStatSummary(matches, statValues, 'arsenal', ['possession'])
    expect(unknown.forAverage).toBeNull()
    expect(unknown.againstAverage).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/team-summary.test.ts`
Expected: FAIL — `src/lib/queries/team-summary.ts` does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/queries/team-summary.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export interface TeamStatSummary {
  statTypeId: string
  forAverage: number | null
  againstAverage: number | null
}

interface MatchPair {
  id: string
  home_team_id: string
  away_team_id: string
}

interface StatValueRow {
  match_id: string
  team_id: string
  stat_type_id: string
  value: number
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function computeTeamStatSummary(
  matches: MatchPair[],
  statValues: StatValueRow[],
  teamId: string,
  statTypeIds: string[]
): TeamStatSummary[] {
  const byMatchTeamStat = new Map(
    statValues.map((s) => [`${s.match_id}:${s.team_id}:${s.stat_type_id}`, s.value])
  )

  return statTypeIds.map((statTypeId) => {
    const forValues: number[] = []
    const againstValues: number[] = []

    for (const m of matches) {
      const opponentId = m.home_team_id === teamId ? m.away_team_id : m.home_team_id
      const forValue = byMatchTeamStat.get(`${m.id}:${teamId}:${statTypeId}`)
      const againstValue = byMatchTeamStat.get(`${m.id}:${opponentId}:${statTypeId}`)
      if (forValue !== undefined) forValues.push(forValue)
      if (againstValue !== undefined) againstValues.push(againstValue)
    }

    return {
      statTypeId,
      forAverage: average(forValues),
      againstAverage: average(againstValues),
    }
  })
}

export async function getTeamStatSummary(
  teamId: string,
  statTypeIds: string[]
): Promise<TeamStatSummary[]> {
  const supabase = await createClient()

  const { data: matches, error: matchesError } = await supabase
    .from('matches')
    .select('id, home_team_id, away_team_id')
    .eq('status', 'finished')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
  if (matchesError) throw matchesError
  if (!matches || matches.length === 0) {
    return statTypeIds.map((statTypeId) => ({ statTypeId, forAverage: null, againstAverage: null }))
  }

  const { data: statValues, error: statError } = await supabase
    .from('stat_values')
    .select('match_id, team_id, stat_type_id, value')
    .in(
      'match_id',
      matches.map((m) => m.id)
    )
    .in('stat_type_id', statTypeIds)
    .is('player_id', null)
  if (statError) throw statError

  return computeTeamStatSummary(
    matches,
    (statValues ?? []).flatMap((s) =>
      s.team_id === null
        ? []
        : [{ match_id: s.match_id, team_id: s.team_id, stat_type_id: s.stat_type_id, value: Number(s.value) }]
    ),
    teamId,
    statTypeIds
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/team-summary.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/team-summary.ts tests/team-summary.test.ts
git commit -m "feat: add per-team, per-stat season summary aggregation"
```

---

### Task 3: Roster and team+league lookups

**Files:**
- Modify: `src/lib/queries/lookups.ts`

**Interfaces:**
- Consumes: `createClient` (already imported in this file)
- Produces:
  - `getRoster(teamId: string): Promise<{ id: string; name: string }[]>`
  - `getTeamWithLeague(teamId: string): Promise<{ id: string; name: string; league_id: string; league: { id: string; name: string; sport_id: string } }>`

- [ ] **Step 1: Add the two functions**

Append to `src/lib/queries/lookups.ts` (after the existing `getStatTypes` function):

```ts
export async function getRoster(teamId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('players')
    .select('id, name')
    .eq('team_id', teamId)
    .order('name')
  if (error) throw error
  return data
}

export async function getTeamWithLeague(teamId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, league_id, league:leagues!teams_league_id_fkey(id, name, sport_id)')
    .eq('id', teamId)
    .single()
  if (error) throw error
  return data
}
```

`teams_league_id_fkey` is the existing foreign key name — confirmed in `src/types/database.types.ts` (`teams` table `Relationships`), same naming convention already used for `matches!matches_home_team_id_fkey` in `src/lib/queries/trends.ts`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/lookups.ts
git commit -m "feat: add roster and team-with-league lookups"
```

---

### Task 4: LeagueSelect component

**Files:**
- Create: `src/components/LeagueSelect.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `LeagueSelect({ leagues: {value: string; label: string}[], selectedLeagueId: string })` — client component, navigates to `/?league=<id>` on change

- [ ] **Step 1: Write the component**

Create `src/components/LeagueSelect.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'

interface Option {
  value: string
  label: string
}

export default function LeagueSelect({
  leagues,
  selectedLeagueId,
}: {
  leagues: Option[]
  selectedLeagueId: string
}) {
  const router = useRouter()

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">League</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        value={selectedLeagueId}
        onChange={(e) => router.push(`/?league=${e.target.value}`)}
      >
        {leagues.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (component is unused until Task 5, that's fine)

- [ ] **Step 3: Commit**

```bash
git add src/components/LeagueSelect.tsx
git commit -m "feat: add league select component"
```

---

### Task 5: Rewrite browse page (`/`)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getLeagues`, `getTeams` (`src/lib/queries/lookups.ts`), `getDataCoverage` (`src/lib/queries/coverage.ts`, Task 1), `LeagueSelect` (Task 4)
- Produces: the browse page at `/`, linking to `/team/[teamId]` (route created in Task 8)

- [ ] **Step 1: Replace the page**

Replace the full contents of `src/app/page.tsx`:

```tsx
import Link from 'next/link'
import LeagueSelect from '@/components/LeagueSelect'
import { getLeagues, getTeams } from '@/lib/queries/lookups'
import { getDataCoverage } from '@/lib/queries/coverage'

export const dynamic = 'force-dynamic'

interface SearchParams {
  league?: string
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const leagues = await getLeagues()
  const leagueId = params.league ?? leagues[0]?.id ?? ''

  const teams = leagueId ? await getTeams(leagueId) : []
  const coverage = teams.length
    ? await getDataCoverage(
        leagueId,
        teams.map((t) => t.id)
      )
    : []
  const coverageByTeam = new Map(coverage.map((c) => [c.teamId, c]))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">Prop Trends</h1>
        <p className="text-sm text-zinc-500">
          Historical stat trends for prop research. No odds, no bets — just the numbers.
        </p>
      </header>

      <LeagueSelect
        leagues={leagues.map((l) => ({ value: l.id, label: l.name }))}
        selectedLeagueId={leagueId}
      />

      <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
        {teams.map((team) => {
          const c = coverageByTeam.get(team.id)
          return (
            <li key={team.id}>
              <Link
                href={`/team/${team.id}`}
                className="flex items-center justify-between py-3 hover:text-blue-600 dark:hover:text-blue-400"
              >
                <span>{team.name}</span>
                <span className="text-sm text-zinc-500">
                  {c ? `${c.coveredMatches}/${c.totalMatches} matches` : '—'} →
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. Note: this will report an unused-import-style error only if `TrendFilters`/`TrendChart`/etc. imports were left behind — they aren't, since this is a full replacement.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: rebuild homepage as team browse list with data coverage"
```

---

### Task 6: StatTiles component

**Files:**
- Create: `src/components/StatTiles.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `StatTiles({ teamId, tiles, selectedStatTypeId, selectedPerspective })` — client component; `interface StatTileData { statTypeId: string; label: string; unit: 'count' | 'percent'; forAverage: number | null; againstAverage: number | null }`. Clicking a tile's for/against value navigates to `/team/<teamId>?stat=<id>&perspective=<for|against>` while preserving other existing query params.

- [ ] **Step 1: Write the component**

Create `src/components/StatTiles.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export interface StatTileData {
  statTypeId: string
  label: string
  unit: 'count' | 'percent'
  forAverage: number | null
  againstAverage: number | null
}

function fmt(n: number | null): string {
  return n === null ? '—' : n % 1 === 0 ? String(n) : n.toFixed(1)
}

export default function StatTiles({
  teamId,
  tiles,
  selectedStatTypeId,
  selectedPerspective,
}: {
  teamId: string
  tiles: StatTileData[]
  selectedStatTypeId: string
  selectedPerspective: 'for' | 'against'
}) {
  const router = useRouter()
  const params = useSearchParams()

  function select(statTypeId: string, perspective: 'for' | 'against') {
    const next = new URLSearchParams(params.toString())
    next.set('stat', statTypeId)
    next.set('perspective', perspective)
    router.push(`/team/${teamId}?${next.toString()}`)
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.statTypeId} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{tile.label}</div>
          <div className="flex items-baseline gap-3 text-lg font-semibold">
            <button
              type="button"
              onClick={() => select(tile.statTypeId, 'for')}
              className={
                selectedStatTypeId === tile.statTypeId && selectedPerspective === 'for'
                  ? 'underline decoration-2 underline-offset-4'
                  : ''
              }
            >
              {fmt(tile.forAverage)}
              {tile.unit === 'percent' && tile.forAverage !== null ? '%' : ''}
            </button>
            {tile.unit !== 'percent' && (
              <button
                type="button"
                onClick={() => select(tile.statTypeId, 'against')}
                className={
                  (selectedStatTypeId === tile.statTypeId && selectedPerspective === 'against'
                    ? 'underline decoration-2 underline-offset-4 '
                    : '') + 'text-sm text-zinc-500'
                }
              >
                {fmt(tile.againstAverage)} vs
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

Note: the design spec says a stat with no data should show "not enough data" on its tile. This implementation instead shows `—`, matching the existing null-value convention already used by `SummaryStats.tsx`'s `fmt` helper — the full phrase reads awkwardly at tile size, and `—` is already the established "no data" signal elsewhere on this page (the chart area below still shows the full "Not enough data yet..." `EmptyState` message when there's nothing to chart at all). This is a deliberate, spec-compatible refinement, not a scope change.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StatTiles.tsx
git commit -m "feat: add stat tile grid component"
```

---

### Task 7: ChartFilters component

**Files:**
- Create: `src/components/ChartFilters.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `ChartFilters({ teamId: string, opponents: {value: string; label: string}[] })` — client component; sets/clears `window`, `venue`, `opponent` query params on `/team/<teamId>`, preserving `stat`/`perspective`.

- [ ] **Step 1: Write the component**

Create `src/components/ChartFilters.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Option {
  value: string
  label: string
}

const WINDOWS: Option[] = [
  { value: 'last5', label: 'Last 5 games' },
  { value: 'last10', label: 'Last 10 games' },
  { value: 'last20', label: 'Last 20 games' },
  { value: 'season', label: 'This season' },
]

const VENUES: Option[] = [
  { value: 'all', label: 'Home & away' },
  { value: 'home', label: 'Home only' },
  { value: 'away', label: 'Away only' },
]

export default function ChartFilters({
  teamId,
  opponents,
}: {
  teamId: string
  opponents: Option[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(param: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    router.push(`/team/${teamId}?${next.toString()}`)
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Window</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={params.get('window') ?? 'last10'}
          onChange={(e) => setParam('window', e.target.value)}
        >
          {WINDOWS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Venue</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={params.get('venue') ?? 'all'}
          onChange={(e) => setParam('venue', e.target.value)}
        >
          {VENUES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Opponent</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 disabled:opacity-50"
          value={params.get('opponent') ?? ''}
          disabled={opponents.length === 0}
          onChange={(e) => setParam('opponent', e.target.value)}
        >
          <option value="">Any opponent</option>
          {opponents.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ChartFilters.tsx
git commit -m "feat: add chart filter controls component"
```

---

### Task 8: Team page (`/team/[teamId]`)

**Files:**
- Create: `src/app/team/[teamId]/page.tsx`

**Interfaces:**
- Consumes:
  - `getTeamWithLeague`, `getRoster`, `getStatTypes`, `getTeams` (`src/lib/queries/lookups.ts`)
  - `getTeamStatSummary` (`src/lib/queries/team-summary.ts`, Task 2)
  - `getTrend`, `type TrendFilters` (`src/lib/queries/trends.ts`, unchanged)
  - `computeTrendSummary` (`src/lib/stats/summary.ts`, unchanged)
  - `linesForStat` (`src/lib/stats/lines.ts`, unchanged)
  - `StatTiles` (Task 6), `ChartFilters` (Task 7)
  - `TrendChart`, `SummaryStats`, `EmptyState` (existing, unchanged)
- Produces: the `/team/[teamId]` route

- [ ] **Step 1: Write the page**

Create `src/app/team/[teamId]/page.tsx`:

```tsx
import Link from 'next/link'
import StatTiles from '@/components/StatTiles'
import ChartFilters from '@/components/ChartFilters'
import TrendChart from '@/components/TrendChart'
import SummaryStats from '@/components/SummaryStats'
import EmptyState from '@/components/EmptyState'
import { getTeamWithLeague, getRoster, getStatTypes, getTeams } from '@/lib/queries/lookups'
import { getTeamStatSummary } from '@/lib/queries/team-summary'
import { getTrend, type TrendFilters as Filters } from '@/lib/queries/trends'
import { computeTrendSummary } from '@/lib/stats/summary'
import { linesForStat } from '@/lib/stats/lines'

export const dynamic = 'force-dynamic'

interface SearchParams {
  stat?: string
  perspective?: string
  window?: string
  venue?: string
  opponent?: string
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { teamId } = await params
  const search = await searchParams

  const team = await getTeamWithLeague(teamId)
  const [statTypes, roster, leagueTeams] = await Promise.all([
    getStatTypes(team.league.sport_id),
    getRoster(teamId),
    getTeams(team.league_id),
  ])

  const statTypeIds = statTypes.map((s) => s.id)
  const summaries = statTypeIds.length ? await getTeamStatSummary(teamId, statTypeIds) : []
  const summaryByStat = new Map(summaries.map((s) => [s.statTypeId, s]))

  const tiles = statTypes.map((s) => {
    const summary = summaryByStat.get(s.id)
    return {
      statTypeId: s.id,
      label: s.name,
      unit: s.unit as 'count' | 'percent',
      forAverage: summary?.forAverage ?? null,
      againstAverage: summary?.againstAverage ?? null,
    }
  })

  const selectedStatType =
    statTypes.find((s) => s.id === search.stat) ?? statTypes[0]
  const selectedPerspective: 'for' | 'against' = search.perspective === 'against' ? 'against' : 'for'

  const filters: Filters | null = selectedStatType
    ? {
        teamId,
        statTypeId: selectedStatType.id,
        perspective: selectedPerspective,
        window: (['last5', 'last10', 'last20', 'season'] as const).includes(search.window as never)
          ? (search.window as Filters['window'])
          : 'last10',
        venue: (['home', 'away'] as const).includes(search.venue as never)
          ? (search.venue as Filters['venue'])
          : 'all',
        opponentTeamId: search.opponent || undefined,
      }
    : null

  const points = filters ? await getTrend(filters) : []
  const summary = filters ? computeTrendSummary(points, linesForStat(filters.statTypeId)) : null

  const opponents = leagueTeams
    .filter((t) => t.id !== teamId)
    .map((t) => ({ value: t.id, label: t.name }))

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-1">
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← All teams
        </Link>
        <h1 className="text-2xl font-bold">{team.name}</h1>
        <p className="text-sm text-zinc-500">{team.league.name}</p>
      </header>

      {roster.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Players</h2>
          <ul className="flex flex-wrap gap-2">
            {roster.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/team/${teamId}/player/${p.id}`}
                  className="rounded-full border border-zinc-300 px-3 py-1 text-sm hover:border-blue-500 dark:border-zinc-700"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Stats</h2>
        {tiles.length === 0 ? (
          <EmptyState message="No stat types configured for this sport yet." />
        ) : (
          <StatTiles
            teamId={teamId}
            tiles={tiles}
            selectedStatTypeId={selectedStatType?.id ?? ''}
            selectedPerspective={selectedPerspective}
          />
        )}
      </section>

      {selectedStatType && (
        <section className="flex flex-col gap-6">
          <ChartFilters teamId={teamId} opponents={opponents} />
          {points.length === 0 ? (
            <EmptyState message="Not enough data yet for this selection. Try a wider window or check back after the next data update." />
          ) : (
            <>
              <TrendChart
                points={points}
                statLabel={`${selectedStatType.name}${selectedPerspective === 'against' ? ' (conceded)' : ''}`}
                average={summary?.average ?? null}
              />
              {summary && <SummaryStats summary={summary} />}
            </>
          )}
        </section>
      )}
    </main>
  )
}
```

Note: the `Players` section links to `/team/[teamId]/player/[playerId]`, which does not exist yet (it's the designed-not-built page from the spec). Since `getRoster` currently returns an empty array for every team (no player rows are ingested), this section renders nothing in practice today — the links exist in code for when roster ingestion ships, matching the spec's edge-case note that there are no dangling links in practice.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/team/[teamId]/page.tsx
git commit -m "feat: add team overview page with stat tiles and shared chart"
```

---

### Task 9: Remove obsolete TrendFilters component

**Files:**
- Delete: `src/components/TrendFilters.tsx`

By this point nothing imports `TrendFilters` — `src/app/page.tsx` was rewritten in Task 5 and no other file ever referenced it.

- [ ] **Step 1: Confirm it's unused**

Run: `grep -r "TrendFilters" src/` (or use your editor's find-in-files)
Expected: no matches outside `src/components/TrendFilters.tsx` itself

- [ ] **Step 2: Delete the file**

```bash
git rm src/components/TrendFilters.tsx
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove TrendFilters, fully replaced by LeagueSelect/StatTiles/ChartFilters"
```

---

### Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the pre-existing `tests/summary.test.ts`, `tests/assemble.test.ts`, `tests/api-football-map.test.ts`, plus the two new files from Tasks 1–2. If this reports "no tests found" or a suspiciously low count, re-check the `vitest.config.ts` situation flagged at the top of this plan.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: build succeeds with no type or route errors (this is the strongest automated check on the new `/team/[teamId]` dynamic route).

- [ ] **Step 3: Manual browser check**

Run: `npm run dev`, then in a browser:
1. Visit `http://localhost:3000/` — confirm the team list renders with coverage badges (e.g. `32/38 matches`) instead of the old filter bar.
2. Click a team — confirm you land on `/team/<id>` with stat tiles showing for/against averages.
3. Click a stat tile's "for" and then "against" value — confirm the chart below updates and the selected value is underlined.
4. Change the window/venue/opponent filters — confirm the chart updates and the tile selection is preserved.
5. Click "← All teams" — confirm it returns to `/`.

If local Supabase isn't running or has no seeded data, empty states should render instead of errors — confirm no unhandled exceptions hit `src/app/error.tsx`.

- [ ] **Step 4: Update CLAUDE.md's Current State note**

This is a real structural change to the shipped app — update the "Current State" paragraph in `CLAUDE.md` to describe the new `/` → `/team/[teamId]` structure in place of "trend dashboard at `/`". Keep it to the same one-paragraph style already used there.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for team browse/overview page structure"
```
