# Soccer Props Research MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the soccer-only MVP of the prop research tool: pick league → team → stat → time window, see a per-game trend chart plus summary numbers, backed by pre-ingested API-Football data in Supabase.

**Architecture:** Sport-agnostic Postgres schema (`sports/leagues/teams/players/matches/stat_types/stat_values`) in Supabase. A provider-adapter layer normalizes API-Football responses into that schema; a cron-protected Next.js API route ingests data daily within the 100-req/day free tier. The frontend is a single Next.js App Router page: server components query Supabase, filters live in the URL, a client-side Recharts bar chart renders the trend.

**Tech Stack:** Next.js 16 (App Router, already scaffolded), Supabase (Postgres + `@supabase/ssr` clients already scaffolded), TypeScript, Tailwind CSS 4, Recharts, Vitest.

## Global Constraints

- **No odds, no betting lines, no bet placement anywhere in the UI or data model** (PRD §1, §4).
- **Team-level stats only** in the UI; the schema must still model `players` (PRD §6, §9).
- **Sport-agnostic naming**: no "soccer" in table/entity names (PRD §8.1).
- **The frontend never calls API-Football directly**; all third-party calls go through server routes, key stored in env vars only (PRD §7, §8).
- **Current season only** (`API_FOOTBALL_SEASON` env, default `2025` = the 2025–26 Premier League season); expanding seasons is config, not schema (PRD §8).
- **Free-tier rate limit is 100 requests/day** — ingestion must batch (default 80 stats calls/run) and be idempotent (PRD §13).
- **Missing stat values are excluded from averages, never treated as zero** (PRD §10.2).
- **No auth, no saved state, no comparisons** (PRD §4).
- Existing repo conventions (CLAUDE.md): migrations in `supabase/migrations/`, server components by default, server Supabase client in server code only, `database.types.ts` is generated.

## File Structure

```
vercel.json                                 # cron schedule for ingestion
vitest.config.ts                            # test runner config
.env.example                                # + API_FOOTBALL_KEY, API_FOOTBALL_SEASON, CRON_SECRET
supabase/migrations/20260712000000_core_schema.sql
src/lib/config.ts                           # season + provider constants
src/lib/stats/summary.ts                    # pure trend-summary math (avg/min/max/over-under)
src/lib/stats/lines.ts                      # default prop thresholds per stat type
src/lib/providers/types.ts                  # ProviderAdapter interface + normalized shapes
src/lib/providers/api-football/map.ts       # pure response→normalized mapping
src/lib/providers/api-football/adapter.ts   # fetch wrapper implementing ProviderAdapter
src/lib/supabase/admin.ts                   # service-role client (server/ingest only)
src/lib/queries/assemble.ts                 # pure matches+stat_values → GamePoint[] assembly
src/lib/queries/trends.ts                   # trend query (Supabase reads + assemble)
src/lib/queries/lookups.ts                  # sports/leagues/teams/stat_types lookups
src/app/api/ingest/route.ts                 # cron-protected ingestion endpoint
src/app/page.tsx                            # the one MVP screen (server component)
src/components/TrendFilters.tsx             # client: selectors bound to URL params
src/components/TrendChart.tsx               # client: Recharts bar chart
src/components/SummaryStats.tsx             # presentational summary numbers
src/components/EmptyState.tsx               # "not enough data" state
tests/summary.test.ts
tests/api-football-map.test.ts
tests/assemble.test.ts
```

---

### Task 1: Test infra + trend summary math

**Files:**
- Modify: `package.json` (add vitest + test script)
- Create: `vitest.config.ts`
- Create: `src/lib/stats/summary.ts`
- Create: `src/lib/stats/lines.ts`
- Test: `tests/summary.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `GamePoint { matchId: string; date: string; opponentName: string; venue: 'home' | 'away'; value: number | null }`
  - `computeTrendSummary(points: GamePoint[], lines: number[]): TrendSummary`
  - `TrendSummary { gamesWithData: number; gamesMissing: number; average: number | null; min: number | null; max: number | null; thresholds: { line: number; overCount: number; underCount: number }[] }`
  - `DEFAULT_LINES: Record<string, number[]>` keyed by stat_type id.

- [ ] **Step 1: Install vitest and wire the test script**

```powershell
npm install -D vitest
```

In `package.json` scripts, add: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 2: Write the failing test**

Create `tests/summary.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeTrendSummary, type GamePoint } from '../src/lib/stats/summary'

function pt(value: number | null, i = 0): GamePoint {
  return {
    matchId: `m${i}`,
    date: `2026-01-0${i + 1}`,
    opponentName: 'Opp',
    venue: 'home',
    value,
  }
}

describe('computeTrendSummary', () => {
  it('computes average, min, max over games with data', () => {
    const s = computeTrendSummary([pt(4, 0), pt(8, 1), pt(6, 2)], [5.5])
    expect(s.gamesWithData).toBe(3)
    expect(s.gamesMissing).toBe(0)
    expect(s.average).toBeCloseTo(6)
    expect(s.min).toBe(4)
    expect(s.max).toBe(8)
  })

  it('excludes null values from all aggregates (never treats gaps as zero)', () => {
    const s = computeTrendSummary([pt(4, 0), pt(null, 1), pt(8, 2)], [5.5])
    expect(s.gamesWithData).toBe(2)
    expect(s.gamesMissing).toBe(1)
    expect(s.average).toBeCloseTo(6)
    expect(s.min).toBe(4)
  })

  it('counts over/under per line, excluding exact ties and nulls', () => {
    const s = computeTrendSummary([pt(4, 0), pt(6, 1), pt(null, 2), pt(5, 3)], [4.5, 5.0])
    const l45 = s.thresholds.find((t) => t.line === 4.5)!
    expect(l45.overCount).toBe(2) // 6 and 5
    expect(l45.underCount).toBe(1) // 4
    const l50 = s.thresholds.find((t) => t.line === 5.0)!
    expect(l50.overCount).toBe(1) // 6
    expect(l50.underCount).toBe(1) // 4; the exact 5 is a tie, excluded
  })

  it('returns null aggregates and empty-safe output for no data', () => {
    const s = computeTrendSummary([pt(null, 0)], [5.5])
    expect(s.gamesWithData).toBe(0)
    expect(s.average).toBeNull()
    expect(s.min).toBeNull()
    expect(s.max).toBeNull()
    expect(s.thresholds[0]).toEqual({ line: 5.5, overCount: 0, underCount: 0 })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/lib/stats/summary`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/stats/summary.ts`:

```ts
export interface GamePoint {
  matchId: string
  date: string
  opponentName: string
  venue: 'home' | 'away'
  value: number | null
}

export interface ThresholdSplit {
  line: number
  overCount: number
  underCount: number
}

export interface TrendSummary {
  gamesWithData: number
  gamesMissing: number
  average: number | null
  min: number | null
  max: number | null
  thresholds: ThresholdSplit[]
}

export function computeTrendSummary(points: GamePoint[], lines: number[]): TrendSummary {
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null)

  const thresholds = lines.map((line) => ({
    line,
    overCount: values.filter((v) => v > line).length,
    underCount: values.filter((v) => v < line).length,
  }))

  return {
    gamesWithData: values.length,
    gamesMissing: points.length - values.length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    thresholds,
  }
}
```

Create `src/lib/stats/lines.ts`:

```ts
// Common prop lines per stat type id (schema seeds these ids in Task 2).
export const DEFAULT_LINES: Record<string, number[]> = {
  corners: [3.5, 4.5, 5.5, 6.5],
  shots: [10.5, 12.5, 14.5],
  shots_on_target: [3.5, 4.5, 5.5],
  fouls: [9.5, 10.5, 11.5],
  yellow_cards: [1.5, 2.5],
  red_cards: [0.5],
  possession: [50],
}

export function linesForStat(statTypeId: string): number[] {
  return DEFAULT_LINES[statTypeId] ?? []
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts src/lib/stats tests/summary.test.ts
git commit -m "feat: trend summary math with gap-safe aggregates and prop-line splits"
```

---

### Task 2: Database schema migration + seeds

**Files:**
- Create: `supabase/migrations/20260712000000_core_schema.sql`
- Modify: `src/types/database.types.ts` (generated — do not hand-edit)

**Interfaces:**
- Consumes: nothing.
- Produces: tables `sports`, `leagues`, `teams`, `players`, `matches`, `stat_types`, `stat_values` with the columns below; seed rows: sport `soccer`, league `Premier League` (provider `api-football`, provider ref `39`), the 7 MVP stat types with ids `corners`, `shots`, `shots_on_target`, `fouls`, `yellow_cards`, `red_cards`, `possession`. All tables have RLS enabled with public read; writes only via service role (which bypasses RLS).

Note on "corners conceded": the schema stores each team's own per-match values only. "Conceded" is derived at query time by reading the *opponent's* row for the same match (Task 5), so there is no `corners_conceded` stat type.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260712000000_core_schema.sql`:

```sql
-- Sport-agnostic core schema (PRD §8.1)

create table sports (
  id text primary key,          -- 'soccer', later 'basketball', ...
  name text not null
);

create table leagues (
  id uuid primary key default gen_random_uuid(),
  sport_id text not null references sports (id),
  name text not null,
  provider text not null,               -- 'api-football'
  provider_league_id text not null,     -- '39' = Premier League
  unique (provider, provider_league_id)
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id),
  name text not null,
  provider text not null,
  provider_team_id text not null,
  unique (provider, provider_team_id)
);

-- Modeled now for the player-props fast-follow; unused by MVP UI (PRD §6).
create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams (id),
  name text not null,
  provider text not null,
  provider_player_id text not null,
  unique (provider, provider_player_id)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues (id),
  season text not null,                 -- '2025' = 2025-26; multi-season is data, not schema
  home_team_id uuid not null references teams (id),
  away_team_id uuid not null references teams (id),
  kickoff_at timestamptz not null,
  status text not null,                 -- 'finished' | 'scheduled' | 'other'
  provider text not null,
  provider_match_id text not null,
  unique (provider, provider_match_id)
);

create index matches_home_team_idx on matches (home_team_id, kickoff_at desc);
create index matches_away_team_idx on matches (away_team_id, kickoff_at desc);

create table stat_types (
  id text primary key,                  -- 'corners', 'shots', ...
  sport_id text not null references sports (id),
  name text not null,
  unit text not null default 'count'
);

create table stat_values (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches (id) on delete cascade,
  team_id uuid references teams (id),
  player_id uuid references players (id),
  stat_type_id text not null references stat_types (id),
  value numeric not null,
  check (team_id is not null or player_id is not null)
);

create unique index stat_values_team_unique
  on stat_values (match_id, stat_type_id, team_id) where player_id is null;
create unique index stat_values_player_unique
  on stat_values (match_id, stat_type_id, player_id) where player_id is not null;

-- RLS: public read, no anon writes (service role bypasses RLS for ingestion).
alter table sports enable row level security;
alter table leagues enable row level security;
alter table teams enable row level security;
alter table players enable row level security;
alter table matches enable row level security;
alter table stat_types enable row level security;
alter table stat_values enable row level security;

create policy "public read" on sports for select using (true);
create policy "public read" on leagues for select using (true);
create policy "public read" on teams for select using (true);
create policy "public read" on players for select using (true);
create policy "public read" on matches for select using (true);
create policy "public read" on stat_types for select using (true);
create policy "public read" on stat_values for select using (true);

-- Seeds
insert into sports (id, name) values ('soccer', 'Soccer');

insert into leagues (sport_id, name, provider, provider_league_id)
values ('soccer', 'Premier League', 'api-football', '39');

insert into stat_types (id, sport_id, name, unit) values
  ('corners', 'soccer', 'Corners', 'count'),
  ('shots', 'soccer', 'Shots', 'count'),
  ('shots_on_target', 'soccer', 'Shots on Target', 'count'),
  ('fouls', 'soccer', 'Fouls', 'count'),
  ('yellow_cards', 'soccer', 'Yellow Cards', 'count'),
  ('red_cards', 'soccer', 'Red Cards', 'count'),
  ('possession', 'soccer', 'Possession', 'percent');
```

- [ ] **Step 2: Apply locally and verify**

If Docker is available:

```powershell
supabase start
supabase db reset
```

Expected: reset applies `20260712000000_core_schema.sql` with no errors.

If Docker is NOT available, apply straight to the remote dev project instead:

```powershell
supabase db push
```

Expected: `Applying migration 20260712000000_core_schema.sql... Finished.`

Verify seeds (local: `supabase db …`; remote: run via Supabase MCP `execute_sql` or the dashboard SQL editor):

```sql
select id from stat_types order by id;
```

Expected: 7 rows (`corners`, `fouls`, `possession`, `red_cards`, `shots`, `shots_on_target`, `yellow_cards`).

- [ ] **Step 3: Generate TypeScript types**

Local stack running: `supabase gen types typescript --local > src/types/database.types.ts`
Remote only: `supabase gen types typescript --project-id aiojsyqokhcrwpekskim > src/types/database.types.ts`

Expected: file contains `sports`, `leagues`, `teams`, `players`, `matches`, `stat_types`, `stat_values` table types.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations src/types/database.types.ts
git commit -m "feat: sport-agnostic core schema with RLS and soccer seeds"
```

---

### Task 3: Provider adapter interface + API-Football mapping

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/lib/providers/types.ts`
- Create: `src/lib/providers/api-football/map.ts`
- Create: `src/lib/providers/api-football/adapter.ts`
- Test: `tests/api-football-map.test.ts`

**Interfaces:**
- Consumes: stat_type ids from Task 2 (`corners`, `shots`, `shots_on_target`, `fouls`, `yellow_cards`, `red_cards`, `possession`).
- Produces:
  - `NormalizedTeam { providerTeamId: string; name: string }`
  - `NormalizedFixture { providerMatchId: string; kickoffAt: string; status: 'finished' | 'scheduled' | 'other'; homeProviderTeamId: string; homeName: string; awayProviderTeamId: string; awayName: string }`
  - `NormalizedStatLine { providerTeamId: string; statTypeId: string; value: number }`
  - `ProviderAdapter { provider: string; fetchTeams(leagueRef, season): Promise<NormalizedTeam[]>; fetchFixtures(leagueRef, season): Promise<NormalizedFixture[]>; fetchMatchStats(providerMatchId): Promise<NormalizedStatLine[]> }`
  - `apiFootballAdapter: ProviderAdapter` and pure `mapTeams`, `mapFixtures`, `mapStatistics` functions.
  - `SEASON` and `PROVIDER` constants from `src/lib/config.ts`.

- [ ] **Step 1: Write the failing mapping tests**

Create `tests/api-football-map.test.ts` (payload shapes copied from API-Football v3 docs):

```ts
import { describe, it, expect } from 'vitest'
import { mapTeams, mapFixtures, mapStatistics } from '../src/lib/providers/api-football/map'

const teamsResponse = [
  { team: { id: 42, name: 'Arsenal' }, venue: { id: 494 } },
  { team: { id: 49, name: 'Chelsea' }, venue: { id: 519 } },
]

const fixturesResponse = [
  {
    fixture: { id: 1035037, date: '2026-04-11T14:00:00+00:00', status: { short: 'FT' } },
    teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
  },
  {
    fixture: { id: 1035099, date: '2026-08-15T14:00:00+00:00', status: { short: 'NS' } },
    teams: { home: { id: 49, name: 'Chelsea' }, away: { id: 42, name: 'Arsenal' } },
  },
  {
    fixture: { id: 1035100, date: '2026-04-12T14:00:00+00:00', status: { short: 'PST' } },
    teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
  },
]

const statisticsResponse = [
  {
    team: { id: 42, name: 'Arsenal' },
    statistics: [
      { type: 'Corner Kicks', value: 8 },
      { type: 'Total Shots', value: 15 },
      { type: 'Shots on Goal', value: 6 },
      { type: 'Fouls', value: 11 },
      { type: 'Yellow Cards', value: 2 },
      { type: 'Red Cards', value: null },
      { type: 'Ball Possession', value: '58%' },
      { type: 'Offsides', value: 3 },
    ],
  },
  {
    team: { id: 49, name: 'Chelsea' },
    statistics: [
      { type: 'Corner Kicks', value: 3 },
      { type: 'Ball Possession', value: '42%' },
    ],
  },
]

describe('mapTeams', () => {
  it('maps provider teams to normalized teams', () => {
    expect(mapTeams(teamsResponse)).toEqual([
      { providerTeamId: '42', name: 'Arsenal' },
      { providerTeamId: '49', name: 'Chelsea' },
    ])
  })
})

describe('mapFixtures', () => {
  it('maps fixtures with normalized status', () => {
    const fixtures = mapFixtures(fixturesResponse)
    expect(fixtures).toHaveLength(3)
    expect(fixtures[0]).toEqual({
      providerMatchId: '1035037',
      kickoffAt: '2026-04-11T14:00:00+00:00',
      status: 'finished',
      homeProviderTeamId: '42',
      homeName: 'Arsenal',
      awayProviderTeamId: '49',
      awayName: 'Chelsea',
    })
    expect(fixtures[1].status).toBe('scheduled')
    expect(fixtures[2].status).toBe('other')
  })
})

describe('mapStatistics', () => {
  it('maps known stat types, parses possession %, skips nulls and unknown types', () => {
    const lines = mapStatistics(statisticsResponse)
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'corners', value: 8 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'shots', value: 15 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'shots_on_target', value: 6 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'possession', value: 58 })
    expect(lines).toContainEqual({ providerTeamId: '49', statTypeId: 'possession', value: 42 })
    // null Red Cards → gap, not zero (PRD §10.2)
    expect(lines.find((l) => l.providerTeamId === '42' && l.statTypeId === 'red_cards')).toBeUndefined()
    // unknown provider types are ignored
    expect(lines.find((l) => l.statTypeId === 'offsides')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/lib/providers/api-football/map`.

- [ ] **Step 3: Write config, types, and mapping implementation**

Create `src/lib/config.ts`:

```ts
export const PROVIDER = 'api-football'
// '2025' = the 2025-26 European season. Change via env to expand coverage.
export const SEASON = process.env.API_FOOTBALL_SEASON ?? '2025'
```

Create `src/lib/providers/types.ts`:

```ts
export interface NormalizedTeam {
  providerTeamId: string
  name: string
}

export interface NormalizedFixture {
  providerMatchId: string
  kickoffAt: string // ISO timestamp
  status: 'finished' | 'scheduled' | 'other'
  homeProviderTeamId: string
  homeName: string
  awayProviderTeamId: string
  awayName: string
}

export interface NormalizedStatLine {
  providerTeamId: string
  statTypeId: string
  value: number
}

export interface ProviderAdapter {
  provider: string
  fetchTeams(leagueRef: string, season: string): Promise<NormalizedTeam[]>
  fetchFixtures(leagueRef: string, season: string): Promise<NormalizedFixture[]>
  fetchMatchStats(providerMatchId: string): Promise<NormalizedStatLine[]>
}
```

Create `src/lib/providers/api-football/map.ts`:

```ts
import type { NormalizedFixture, NormalizedStatLine, NormalizedTeam } from '../types'

// API-Football v3 response item shapes (only the fields we read).
interface ApiTeamItem {
  team: { id: number; name: string }
}

interface ApiFixtureItem {
  fixture: { id: number; date: string; status: { short: string } }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
}

interface ApiStatisticsItem {
  team: { id: number; name: string }
  statistics: { type: string; value: number | string | null }[]
}

const FINISHED = new Set(['FT', 'AET', 'PEN'])
const SCHEDULED = new Set(['NS', 'TBD'])

const STAT_TYPE_MAP: Record<string, string> = {
  'Corner Kicks': 'corners',
  'Total Shots': 'shots',
  'Shots on Goal': 'shots_on_target',
  Fouls: 'fouls',
  'Yellow Cards': 'yellow_cards',
  'Red Cards': 'red_cards',
  'Ball Possession': 'possession',
}

export function mapTeams(items: ApiTeamItem[]): NormalizedTeam[] {
  return items.map((i) => ({ providerTeamId: String(i.team.id), name: i.team.name }))
}

export function mapFixtures(items: ApiFixtureItem[]): NormalizedFixture[] {
  return items.map((i) => ({
    providerMatchId: String(i.fixture.id),
    kickoffAt: i.fixture.date,
    status: FINISHED.has(i.fixture.status.short)
      ? 'finished'
      : SCHEDULED.has(i.fixture.status.short)
        ? 'scheduled'
        : 'other',
    homeProviderTeamId: String(i.teams.home.id),
    homeName: i.teams.home.name,
    awayProviderTeamId: String(i.teams.away.id),
    awayName: i.teams.away.name,
  }))
}

export function mapStatistics(items: ApiStatisticsItem[]): NormalizedStatLine[] {
  const lines: NormalizedStatLine[] = []
  for (const item of items) {
    for (const stat of item.statistics) {
      const statTypeId = STAT_TYPE_MAP[stat.type]
      if (!statTypeId || stat.value === null) continue // gaps stay gaps (PRD §10.2)
      const value =
        typeof stat.value === 'string' ? Number.parseFloat(stat.value) : stat.value
      if (Number.isNaN(value)) continue
      lines.push({ providerTeamId: String(item.team.id), statTypeId, value })
    }
  }
  return lines
}
```

Create `src/lib/providers/api-football/adapter.ts` (thin network wrapper — covered by the mapping tests plus the live verification in Task 8, not unit-tested):

```ts
import type { ProviderAdapter } from '../types'
import { mapFixtures, mapStatistics, mapTeams } from './map'

const BASE_URL = 'https://v3.football.api-sports.io'

async function apiGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set')

  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, { headers: { 'x-apisports-key': key } })
  if (!res.ok) throw new Error(`API-Football ${path} failed: ${res.status}`)

  const body = (await res.json()) as { errors: unknown; response: T[] }
  // API-Football returns 200 with an errors object on rate-limit/auth problems.
  if (body.errors && Object.keys(body.errors as object).length > 0) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(body.errors)}`)
  }
  return body.response
}

export const apiFootballAdapter: ProviderAdapter = {
  provider: 'api-football',

  async fetchTeams(leagueRef, season) {
    return mapTeams(await apiGet('/teams', { league: leagueRef, season }))
  },

  async fetchFixtures(leagueRef, season) {
    return mapFixtures(await apiGet('/fixtures', { league: leagueRef, season }))
  },

  async fetchMatchStats(providerMatchId) {
    return mapStatistics(await apiGet('/fixtures/statistics', { fixture: providerMatchId }))
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (summary tests + 3 new mapping test blocks).

- [ ] **Step 5: Commit**

```powershell
git add src/lib/config.ts src/lib/providers tests/api-football-map.test.ts
git commit -m "feat: provider adapter interface and API-Football mapping"
```

---

### Task 4: Ingestion route + cron

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Create: `src/app/api/ingest/route.ts`
- Create: `vercel.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `apiFootballAdapter` (Task 3), `PROVIDER`/`SEASON` from `src/lib/config.ts`, tables from Task 2.
- Produces: `GET /api/ingest` (Bearer `CRON_SECRET`), idempotent; upserts teams and matches, then fills `stat_values` for up to `?limit=` (default 80) finished matches that don't have stats yet. Returns JSON `{ teams, matches, statsFetched, statsRemaining }`.

- [ ] **Step 1: Create the service-role client**

Create `src/lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

// Service-role client: bypasses RLS. Server-side ingestion only — never
// import from client components.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 2: Write the ingestion route**

Create `src/app/api/ingest/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiFootballAdapter } from '@/lib/providers/api-football/adapter'
import { PROVIDER, SEASON } from '@/lib/config'

export const maxDuration = 300

const LEAGUE_REF = '39' // Premier League; matches the seed row in leagues

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const limit = Math.max(
    1,
    Math.min(90, Number(request.nextUrl.searchParams.get('limit') ?? 80))
  )
  const db = createAdminClient()

  try {
    const { data: league, error: leagueError } = await db
      .from('leagues')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('provider_league_id', LEAGUE_REF)
      .single()
    if (leagueError || !league) throw new Error('League seed row missing')

    // 1. Teams (1 API request)
    const teams = await apiFootballAdapter.fetchTeams(LEAGUE_REF, SEASON)
    const { error: teamsError } = await db.from('teams').upsert(
      teams.map((t) => ({
        league_id: league.id,
        name: t.name,
        provider: PROVIDER,
        provider_team_id: t.providerTeamId,
      })),
      { onConflict: 'provider,provider_team_id' }
    )
    if (teamsError) throw teamsError

    const { data: teamRows, error: teamRowsError } = await db
      .from('teams')
      .select('id, provider_team_id')
      .eq('provider', PROVIDER)
    if (teamRowsError) throw teamRowsError
    const teamIdByRef = new Map(teamRows.map((t) => [t.provider_team_id, t.id]))

    // 2. Fixtures (1 API request)
    const fixtures = await apiFootballAdapter.fetchFixtures(LEAGUE_REF, SEASON)
    const matchRows = fixtures.flatMap((f) => {
      const home = teamIdByRef.get(f.homeProviderTeamId)
      const away = teamIdByRef.get(f.awayProviderTeamId)
      if (!home || !away) return []
      return [
        {
          league_id: league.id,
          season: SEASON,
          home_team_id: home,
          away_team_id: away,
          kickoff_at: f.kickoffAt,
          status: f.status,
          provider: PROVIDER,
          provider_match_id: f.providerMatchId,
        },
      ]
    })
    const { error: matchesError } = await db
      .from('matches')
      .upsert(matchRows, { onConflict: 'provider,provider_match_id' })
    if (matchesError) throw matchesError

    // 3. Stats for finished matches that don't have them yet
    // (batched to stay inside the 100 req/day free tier)
    const { data: finished, error: finishedError } = await db
      .from('matches')
      .select('id, provider_match_id, stat_values(id)')
      .eq('provider', PROVIDER)
      .eq('status', 'finished')
      .order('kickoff_at', { ascending: false })
    if (finishedError) throw finishedError

    const pending = finished.filter((m) => m.stat_values.length === 0)
    const batch = pending.slice(0, limit)

    for (const match of batch) {
      const lines = await apiFootballAdapter.fetchMatchStats(match.provider_match_id)
      if (lines.length === 0) continue
      const { error: statError } = await db.from('stat_values').upsert(
        lines.flatMap((l) => {
          const teamId = teamIdByRef.get(l.providerTeamId)
          if (!teamId) return []
          return [
            {
              match_id: match.id,
              team_id: teamId,
              stat_type_id: l.statTypeId,
              value: l.value,
            },
          ]
        }),
        { onConflict: 'match_id,stat_type_id,team_id' }
      )
      if (statError) throw statError
    }

    return NextResponse.json({
      teams: teams.length,
      matches: matchRows.length,
      statsFetched: batch.length,
      statsRemaining: pending.length - batch.length,
    })
  } catch (err) {
    // Serve stale data rather than breaking the app; the read path is untouched.
    console.error('Ingestion failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
```

- [ ] **Step 3: Add cron config and env examples**

Create `vercel.json`:

```json
{
  "crons": [{ "path": "/api/ingest", "schedule": "0 6 * * *" }]
}
```

(Vercel invokes cron paths with `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is set on the project.)

Append to `.env.example`:

```
API_FOOTBALL_KEY=
API_FOOTBALL_SEASON=2025
CRON_SECRET=
```

- [ ] **Step 4: Verify build + auth guard**

Run: `npm run build`
Expected: build succeeds, `/api/ingest` listed as a dynamic route.

Then start `npm run dev` and verify the guard rejects unauthenticated calls:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://localhost:3000/api/ingest
```

Expected: `401`. (The authorized 200 path is verified live in Task 8 once env keys exist.)

- [ ] **Step 5: Commit**

```powershell
git add src/lib/supabase/admin.ts src/app/api/ingest vercel.json .env.example
git commit -m "feat: cron-protected API-Football ingestion route"
```

---

### Task 5: Trend assembly + queries

**Files:**
- Create: `src/lib/queries/assemble.ts`
- Create: `src/lib/queries/trends.ts`
- Create: `src/lib/queries/lookups.ts`
- Test: `tests/assemble.test.ts`

**Interfaces:**
- Consumes: `GamePoint` from `src/lib/stats/summary` (Task 1), tables from Task 2, server Supabase client from `src/lib/supabase/server.ts` (scaffold).
- Produces:
  - `assemblePoints(matches: MatchRow[], statValues: StatValueRow[], teamId: string, perspective: 'for' | 'against'): GamePoint[]` where `MatchRow { id: string; kickoff_at: string; home_team_id: string; away_team_id: string; home_name: string; away_name: string }` and `StatValueRow { match_id: string; team_id: string; value: number }`.
  - `TrendFilters { teamId: string; statTypeId: string; perspective: 'for' | 'against'; window: 'last5' | 'last10' | 'last20' | 'season'; venue: 'all' | 'home' | 'away'; opponentTeamId?: string }`
  - `getTrend(filters: TrendFilters): Promise<GamePoint[]>` — chronological (oldest→newest).
  - `getLeagues(): Promise<{ id: string; name: string; sport_id: string }[]>`, `getTeams(leagueId: string): Promise<{ id: string; name: string }[]>`, `getStatTypes(sportId: string): Promise<{ id: string; name: string; unit: string }[]>`.

- [ ] **Step 1: Write the failing assembly test**

Create `tests/assemble.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { assemblePoints } from '../src/lib/queries/assemble'

const matches = [
  {
    id: 'm1',
    kickoff_at: '2026-01-10T15:00:00Z',
    home_team_id: 'arsenal',
    away_team_id: 'chelsea',
    home_name: 'Arsenal',
    away_name: 'Chelsea',
  },
  {
    id: 'm2',
    kickoff_at: '2026-01-17T15:00:00Z',
    home_team_id: 'spurs',
    away_team_id: 'arsenal',
    home_name: 'Spurs',
    away_name: 'Arsenal',
  },
]

const statValues = [
  { match_id: 'm1', team_id: 'arsenal', value: 8 },
  { match_id: 'm1', team_id: 'chelsea', value: 3 },
  { match_id: 'm2', team_id: 'spurs', value: 5 },
  // arsenal value for m2 missing → data gap
]

describe('assemblePoints', () => {
  it("perspective 'for' returns the team's own values with venue and opponent", () => {
    const points = assemblePoints(matches, statValues, 'arsenal', 'for')
    expect(points).toEqual([
      { matchId: 'm1', date: '2026-01-10T15:00:00Z', opponentName: 'Chelsea', venue: 'home', value: 8 },
      { matchId: 'm2', date: '2026-01-17T15:00:00Z', opponentName: 'Spurs', venue: 'away', value: null },
    ])
  })

  it("perspective 'against' returns the opponent's values (conceded)", () => {
    const points = assemblePoints(matches, statValues, 'arsenal', 'against')
    expect(points[0].value).toBe(3) // Chelsea's corners = corners conceded by Arsenal
    expect(points[1].value).toBe(5) // Spurs' corners
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/lib/queries/assemble`.

- [ ] **Step 3: Write the assembly implementation**

Create `src/lib/queries/assemble.ts`:

```ts
import type { GamePoint } from '@/lib/stats/summary'

export interface MatchRow {
  id: string
  kickoff_at: string
  home_team_id: string
  away_team_id: string
  home_name: string
  away_name: string
}

export interface StatValueRow {
  match_id: string
  team_id: string
  value: number
}

export function assemblePoints(
  matches: MatchRow[],
  statValues: StatValueRow[],
  teamId: string,
  perspective: 'for' | 'against'
): GamePoint[] {
  const valueByMatchTeam = new Map(
    statValues.map((s) => [`${s.match_id}:${s.team_id}`, s.value])
  )

  return matches.map((m) => {
    const isHome = m.home_team_id === teamId
    const opponentId = isHome ? m.away_team_id : m.home_team_id
    const subjectId = perspective === 'for' ? teamId : opponentId
    return {
      matchId: m.id,
      date: m.kickoff_at,
      opponentName: isHome ? m.away_name : m.home_name,
      venue: isHome ? 'home' : 'away',
      value: valueByMatchTeam.get(`${m.id}:${subjectId}`) ?? null,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Write the Supabase-backed query functions**

Create `src/lib/queries/trends.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { assemblePoints, type MatchRow } from './assemble'
import type { GamePoint } from '@/lib/stats/summary'

export interface TrendFilters {
  teamId: string
  statTypeId: string
  perspective: 'for' | 'against'
  window: 'last5' | 'last10' | 'last20' | 'season'
  venue: 'all' | 'home' | 'away'
  opponentTeamId?: string
}

const WINDOW_LIMIT: Record<TrendFilters['window'], number | null> = {
  last5: 5,
  last10: 10,
  last20: 20,
  season: null,
}

export async function getTrend(filters: TrendFilters): Promise<GamePoint[]> {
  const supabase = await createClient()
  const { teamId, venue, opponentTeamId } = filters

  let query = supabase
    .from('matches')
    .select(
      'id, kickoff_at, home_team_id, away_team_id, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name)'
    )
    .eq('status', 'finished')
    .order('kickoff_at', { ascending: false })

  if (venue === 'home') {
    query = query.eq('home_team_id', teamId)
    if (opponentTeamId) query = query.eq('away_team_id', opponentTeamId)
  } else if (venue === 'away') {
    query = query.eq('away_team_id', teamId)
    if (opponentTeamId) query = query.eq('home_team_id', opponentTeamId)
  } else if (opponentTeamId) {
    query = query.or(
      `and(home_team_id.eq.${teamId},away_team_id.eq.${opponentTeamId}),and(home_team_id.eq.${opponentTeamId},away_team_id.eq.${teamId})`
    )
  } else {
    query = query.or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
  }

  const limit = WINDOW_LIMIT[filters.window]
  if (limit) query = query.limit(limit)

  const { data: rawMatches, error } = await query
  if (error) throw error

  const matches: MatchRow[] = rawMatches.map((m) => ({
    id: m.id,
    kickoff_at: m.kickoff_at,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_name: m.home?.name ?? 'Unknown',
    away_name: m.away?.name ?? 'Unknown',
  }))

  if (matches.length === 0) return []

  const { data: statValues, error: statError } = await supabase
    .from('stat_values')
    .select('match_id, team_id, value')
    .eq('stat_type_id', filters.statTypeId)
    .is('player_id', null)
    .in('match_id', matches.map((m) => m.id))
  if (statError) throw statError

  const points = assemblePoints(
    matches,
    (statValues ?? []).map((s) => ({ ...s, team_id: s.team_id!, value: Number(s.value) })),
    teamId,
    filters.perspective
  )

  // chronological for the chart
  return points.reverse()
}
```

Create `src/lib/queries/lookups.ts`:

```ts
import { createClient } from '@/lib/supabase/server'

export async function getLeagues() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, sport_id')
    .order('name')
  if (error) throw error
  return data
}

export async function getTeams(leagueId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .order('name')
  if (error) throw error
  return data
}

export async function getStatTypes(sportId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stat_types')
    .select('id, name, unit')
    .eq('sport_id', sportId)
    .order('name')
  if (error) throw error
  return data
}
```

- [ ] **Step 6: Verify types and tests**

Run: `npx tsc --noEmit; npm test`
Expected: no type errors (the `teams!matches_home_team_id_fkey` hint names may need adjusting to match the generated types from Task 2 — if `tsc` complains, check the FK names in `src/types/database.types.ts`); all tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/queries tests/assemble.test.ts
git commit -m "feat: trend assembly, trend query, and lookup queries"
```

---

### Task 6: UI — filters, page, chart, summary, empty state

**Files:**
- Create: `src/components/TrendFilters.tsx`
- Create: `src/components/TrendChart.tsx`
- Create: `src/components/SummaryStats.tsx`
- Create: `src/components/EmptyState.tsx`
- Modify: `src/app/page.tsx` (replace scaffold content)
- Modify: `src/app/layout.tsx` (title/description only)
- Modify: `package.json` (add recharts)

**Interfaces:**
- Consumes: `getLeagues`/`getTeams`/`getStatTypes` (Task 5), `getTrend` + `TrendFilters` (Task 5), `computeTrendSummary` + `linesForStat` (Task 1).
- Produces: the complete MVP screen at `/`. All filter state lives in URL search params: `league`, `team`, `stat` (`<statTypeId>` or `<statTypeId>:against`), `window` (`last5|last10|last20|season`, default `last10`), `venue` (`all|home|away`, default `all`), `opponent`.

- [ ] **Step 1: Install recharts**

```powershell
npm install recharts
```

- [ ] **Step 2: Write the filter component (client)**

Create `src/components/TrendFilters.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Option {
  value: string
  label: string
}

interface Props {
  leagues: Option[]
  teams: Option[]
  stats: Option[] // includes both "X taken" (id) and "X conceded" (id:against) options
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

function Select({
  label,
  param,
  options,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string
  param: string
  options: Option[]
  value: string
  placeholder?: string
  onChange: (param: string, value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(param, e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function TrendFilters({ leagues, teams, stats }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(param: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    // changing league invalidates team/opponent selections
    if (param === 'league') {
      next.delete('team')
      next.delete('opponent')
    }
    router.push(`/?${next.toString()}`)
  }

  const opponents = teams.filter((t) => t.value !== (params.get('team') ?? ''))

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
      <Select
        label="Sport"
        param="sport"
        options={[{ value: 'soccer', label: 'Soccer' }]}
        value="soccer"
        onChange={() => {}}
      />
      <Select
        label="League"
        param="league"
        options={leagues}
        value={params.get('league') ?? ''}
        placeholder="Select league"
        onChange={setParam}
      />
      <Select
        label="Team"
        param="team"
        options={teams}
        value={params.get('team') ?? ''}
        placeholder="Select team"
        onChange={setParam}
        disabled={teams.length === 0}
      />
      <Select
        label="Stat"
        param="stat"
        options={stats}
        value={params.get('stat') ?? ''}
        placeholder="Select stat"
        onChange={setParam}
      />
      <Select
        label="Window"
        param="window"
        options={WINDOWS}
        value={params.get('window') ?? 'last10'}
        onChange={setParam}
      />
      <Select
        label="Venue"
        param="venue"
        options={VENUES}
        value={params.get('venue') ?? 'all'}
        onChange={setParam}
      />
      <Select
        label="Opponent"
        param="opponent"
        options={opponents}
        value={params.get('opponent') ?? ''}
        placeholder="Any opponent"
        onChange={setParam}
        disabled={opponents.length === 0}
      />
    </div>
  )
}
```

- [ ] **Step 3: Write chart, summary, and empty-state components**

Create `src/components/TrendChart.tsx`:

```tsx
'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GamePoint } from '@/lib/stats/summary'

interface Props {
  points: GamePoint[]
  statLabel: string
  average: number | null
}

export default function TrendChart({ points, statLabel, average }: Props) {
  const data = points.map((p) => ({
    label: `${p.venue === 'home' ? 'vs' : '@'} ${p.opponentName}`,
    date: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: p.value,
  }))

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [value ?? 'No data', statLabel]}
            labelFormatter={(_, payload) =>
              payload?.[0] ? `${payload[0].payload.label} (${payload[0].payload.date})` : ''
            }
          />
          {average !== null && (
            <ReferenceLine
              y={average}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: `avg ${average.toFixed(1)}`, fontSize: 12, position: 'right' }}
            />
          )}
          <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

Create `src/components/SummaryStats.tsx`:

```tsx
import type { TrendSummary } from '@/lib/stats/summary'

export default function SummaryStats({ summary }: { summary: TrendSummary }) {
  const fmt = (n: number | null) => (n === null ? '—' : n % 1 === 0 ? String(n) : n.toFixed(1))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Average" value={fmt(summary.average)} />
        <Tile label="Min" value={fmt(summary.min)} />
        <Tile label="Max" value={fmt(summary.max)} />
        <Tile
          label="Games"
          value={
            summary.gamesMissing > 0
              ? `${summary.gamesWithData} (${summary.gamesMissing} no data)`
              : String(summary.gamesWithData)
          }
        />
      </div>
      {summary.thresholds.length > 0 && summary.gamesWithData > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Over / under splits
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.thresholds.map((t) => (
              <span
                key={t.line}
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
              >
                {t.line}: <strong>{t.overCount}</strong> over / <strong>{t.underCount}</strong> under
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
```

Create `src/components/EmptyState.tsx`:

```tsx
export default function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-500 dark:border-zinc-700">
      <p>{message}</p>
    </div>
  )
}
```

- [ ] **Step 4: Write the page**

Replace `src/app/page.tsx`:

```tsx
import TrendFilters from '@/components/TrendFilters'
import TrendChart from '@/components/TrendChart'
import SummaryStats from '@/components/SummaryStats'
import EmptyState from '@/components/EmptyState'
import { getLeagues, getStatTypes, getTeams } from '@/lib/queries/lookups'
import { getTrend, type TrendFilters as Filters } from '@/lib/queries/trends'
import { computeTrendSummary } from '@/lib/stats/summary'
import { linesForStat } from '@/lib/stats/lines'

export const dynamic = 'force-dynamic'

interface SearchParams {
  league?: string
  team?: string
  stat?: string
  window?: string
  venue?: string
  opponent?: string
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const leagues = await getLeagues()
  const leagueId = params.league ?? leagues[0]?.id ?? ''
  const league = leagues.find((l) => l.id === leagueId)

  const [teams, statTypes] = await Promise.all([
    leagueId ? getTeams(leagueId) : Promise.resolve([]),
    league ? getStatTypes(league.sport_id) : Promise.resolve([]),
  ])

  // "corners" → taken, "corners:against" → conceded
  const statOptions = statTypes.flatMap((s) => [
    { value: s.id, label: `${s.name}${s.unit === 'percent' ? '' : ' (for)'}` },
    ...(s.unit === 'percent'
      ? []
      : [{ value: `${s.id}:against`, label: `${s.name} (conceded)` }]),
  ])

  const [statTypeId, perspectiveRaw] = (params.stat ?? '').split(':')
  const statType = statTypes.find((s) => s.id === statTypeId)
  const filters: Filters | null =
    params.team && statType
      ? {
          teamId: params.team,
          statTypeId: statType.id,
          perspective: perspectiveRaw === 'against' ? 'against' : 'for',
          window: (['last5', 'last10', 'last20', 'season'] as const).includes(
            params.window as never
          )
            ? (params.window as Filters['window'])
            : 'last10',
          venue: (['home', 'away'] as const).includes(params.venue as never)
            ? (params.venue as Filters['venue'])
            : 'all',
          opponentTeamId: params.opponent || undefined,
        }
      : null

  const points = filters ? await getTrend(filters) : []
  const summary = filters ? computeTrendSummary(points, linesForStat(statType!.id)) : null
  const teamName = teams.find((t) => t.id === params.team)?.name
  const statLabel = statOptions.find((o) => o.value === params.stat)?.label ?? ''

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="text-2xl font-bold">Prop Trends</h1>
        <p className="text-sm text-zinc-500">
          Historical stat trends for prop research. No odds, no bets — just the numbers.
        </p>
      </header>

      <TrendFilters
        leagues={leagues.map((l) => ({ value: l.id, label: l.name }))}
        teams={teams.map((t) => ({ value: t.id, label: t.name }))}
        stats={statOptions}
      />

      {!filters ? (
        <EmptyState message="Pick a team and a stat to see the trend." />
      ) : points.length === 0 ? (
        <EmptyState message="Not enough data yet for this selection. Try a wider window or check back after the next data update." />
      ) : (
        <section className="flex flex-col gap-6">
          <h2 className="text-lg font-semibold">
            {teamName} — {statLabel}
          </h2>
          <TrendChart
            points={points}
            statLabel={statLabel}
            average={summary?.average ?? null}
          />
          {summary && <SummaryStats summary={summary} />}
        </section>
      )}
    </main>
  )
}
```

In `src/app/layout.tsx`, change only the metadata:

```tsx
export const metadata: Metadata = {
  title: "Prop Trends — Sports Stat Research",
  description: "Historical team stat trends for prop research. Stats only — no odds, no betting.",
};
```

- [ ] **Step 5: Verify build and browse locally**

Run: `npx tsc --noEmit`, then `npm run build`.
Expected: both succeed.

Start the dev server and open http://localhost:3000. With an empty DB you should see the league selector populated (Premier League from the seed), an empty team list, and the "Pick a team and a stat" empty state — no crashes. Full data verification happens in Task 8.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json src/components src/app/page.tsx src/app/layout.tsx
git commit -m "feat: trend dashboard UI with filters, chart, and summary"
```

---

### Task 7: Edge-case polish — global error resilience

**Files:**
- Create: `src/app/error.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a friendly error boundary so a failed Supabase read degrades gracefully instead of a white screen (PRD §10.2 "serve last cached data rather than erroring the whole app" — reads always hit our DB, so the failure mode left is the DB itself being unreachable).

- [ ] **Step 1: Add the error boundary**

Create `src/app/error.tsx`:

```tsx
'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-xl font-semibold">Something went wrong loading the data</h1>
      <p className="text-sm text-zinc-500">
        The stats database may be temporarily unavailable. Your last results are still valid —
        try again in a moment.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
      >
        Try again
      </button>
    </main>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```powershell
git add src/app/error.tsx
git commit -m "feat: graceful error boundary for data-load failures"
```

---

### Task 8: Deploy, ingest, verify end-to-end

This task needs things only the user can provide once: an **API-Football API key** (free tier: https://dashboard.api-football.com) — pause and ask for it if `.env.local` doesn't have `API_FOOTBALL_KEY`.

**Files:**
- Modify: `.env.local` (never committed)

**Interfaces:**
- Consumes: everything above.
- Produces: deployed, populated production app meeting PRD §12 success criteria.

- [ ] **Step 1: Local env setup**

Ensure `.env.local` contains (values from the user / Supabase dashboard):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
API_FOOTBALL_KEY=...
API_FOOTBALL_SEASON=2025
CRON_SECRET=<generate: openssl rand -hex 16 or any long random string>
```

- [ ] **Step 2: Apply migration to the remote project (if not already done in Task 2)**

```powershell
supabase db push
```

Expected: migration applied (or "Remote database is up to date").

- [ ] **Step 3: Run the first ingestion locally**

Start `npm run dev`, then (PowerShell):

```powershell
curl.exe -s -H "Authorization: Bearer <CRON_SECRET value>" "http://localhost:3000/api/ingest?limit=80"
```

Expected: JSON like `{"teams":20,"matches":380,"statsFetched":80,"statsRemaining":...}`. This uses ~82 of the 100 daily requests. Remaining matches fill in on subsequent daily cron runs (~5 days to full season, or immediately on a paid key).

- [ ] **Step 4: Verify the full user flow locally**

Open http://localhost:3000 and verify: league defaults to Premier League → pick a team → pick "Corners (for)" → Last 10 → chart renders with bars, average reference line, over/under chips at 3.5/4.5/5.5/6.5. Switch to "Corners (conceded)", "Away only", and an opponent filter; verify the chart updates. Pick a selection with no ingested data and confirm the "Not enough data" state.

- [ ] **Step 5: Set Vercel env vars and deploy**

Set on the Vercel project (dashboard → sports-tracker → Settings → Environment Variables, or `vercel env add` if the CLI is installed): `API_FOOTBALL_KEY`, `API_FOOTBALL_SEASON=2025`, `CRON_SECRET`, plus the three Supabase vars if not already present.

Deploy: commit everything, then `git push` (master auto-deploys per CLAUDE.md) or use the vercel:deploy skill for a preview first.

- [ ] **Step 6: Verify production**

Open the production URL: complete the full flow for at least 3 different teams and 3 stats. Confirm `/api/ingest` without auth returns 401 in production. Confirm the Vercel cron is registered (project → Settings → Cron Jobs shows `0 6 * * *`).

- [ ] **Step 7: Update CLAUDE.md current state and commit**

Update the `## Current State` section of `CLAUDE.md` to describe the shipped MVP (schema, ingestion route, dashboard) and note the ingestion backfill cadence. Also fill `## Domain Concepts` with the entity list (Sport/League/Team/Player/Match/StatType/StatValue) and the "conceded = opponent's row" rule.

```powershell
git add CLAUDE.md
git commit -m "docs: record MVP state and domain concepts"
git push
```

---

## Self-Review Notes

- **Spec coverage:** PRD §5 flow (league→team→stat→filter→chart) → Tasks 5–6; §6 stat list → Task 2 seeds + Task 3 mapping; §7 provider → Task 3–4; §8 env/creds/season → Tasks 4, 8; §8.1 sport-agnostic model incl. players → Task 2; §8.2 adapter pattern → Task 3; §8.3 ingestion/caching/cron → Task 4; §10.1 screens (merged into one page — the PRD's three "screens" are steps of one flow, and a single URL-driven page satisfies all three) → Task 6; §10.2 edge cases → empty state (Task 6), gap exclusion (Tasks 1, 3, 5), error resilience (Task 7 + ingest route serves stale data by design); §12 success criteria → Task 8.
- **Types:** `GamePoint` defined once in Task 1 and imported everywhere; `TrendFilters` defined in Task 5 and consumed in Task 6; stat_type ids consistent across Task 2 seeds, Task 3 mapping, and Task 1 lines.
- **Known judgment calls:** "corners conceded" derived from opponent rows (no duplicate stat rows); possession excluded from "conceded" options; single-page UI instead of three separate routes; vercel.json (not vercel.ts) since we only need one cron entry.
