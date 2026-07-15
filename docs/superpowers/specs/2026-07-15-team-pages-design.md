# Team-Centric Pages Design

**Goal:** Replace the current single-page trend dashboard with a browse → team drill-down
structure: an index of teams with data-coverage context, a team page that shows every
stat at a glance and lets you chart any one of them, and a forward-looking (not-yet-built)
player page that mirrors the same pattern once player-level stats exist.

**Why now:** The MVP shipped as one page where a user picks league, team, and stat all in
one filter bar before seeing anything (`src/app/page.tsx`). That matches the PRD's flow
conceptually but not its original 3-screen sketch, and it doesn't give a team its own
place to live — there's no way to see "everything about Arsenal" without already knowing
which stat you want. This pass restructures navigation around teams as the primary unit,
without changing the underlying data model, provider adapter, or ingestion pipeline.

**Explicitly out of scope for this pass** (deferred, unchanged from PRD):
- Visual redesign — `docs/design.md` (pirsch.io-inspired dark system) is a separate,
  later pass applied once this page structure exists
- Player stat ingestion / new provider-adapter work
- Comparison view, saved watchlists/auth, additional league data
- Any change to `supabase/migrations/`, the provider adapter, or the ingest route

## Route structure

| Route | Status | Purpose |
|---|---|---|
| `/` | Rebuilt | Browse: pick league, list teams with data coverage |
| `/team/[teamId]` | New | Team overview: roster + all-stat tiles + one shared chart |
| `/team/[teamId]/player/[playerId]` | Designed, not built | Player overview, same pattern as team page, scoped to individual stats |

All three remain Next.js App Router server components. Filter state (selected stat,
window, venue, opponent) stays in the URL as query params, same pattern as today's
`page.tsx` — no new client-side state management.

The current `/team/[teamId]/stat/[statTypeId]` idea (considered and rejected during
design) is **not** part of this structure — one team page with a stat-tile selector and
a single shared chart replaces it, rather than a dedicated page per stat.

## 1. Browse page (`/`)

- League selector at the top. Only "Premier League" is selectable today, but it renders
  as a real selector (not hardcoded text) so adding a second league later is additive.
- Below it, a flat list of teams in the selected league. Each row shows:
  - Team name
  - A data-coverage badge, e.g. `32/38 matches` — the count of that team's matches that
    have at least one ingested stat value, out of total matches in the season
  - Links to `/team/[teamId]`
- No headline stat on this page — the badge's only job is to set expectations about
  trend reliability before the user commits to a team, not to be a stat view itself.
- Teams with zero covered matches still appear (badge reads `0/38`), so the list matches
  the full league roster regardless of ingestion progress.

## 2. Team page (`/team/[teamId]`)

**Header:** team name, league name (static text, not a switcher — league switching
happens on the browse page).

**Players section:**
- Roster list sourced from the existing (currently unused in queries) `players` table,
  each entry linking to `/team/[teamId]/player/[playerId]`.
- Since no player-level stats are ingested yet, this section renders only if the roster
  query returns rows; if the roster is empty, the section is omitted entirely rather than
  showing a permanent "coming soon" placeholder. Once roster ingestion exists, real rows
  appear automatically — no page-level change needed then.

**Stats section:**
- One tile per team-level stat type (corners, shots, shots on target, fouls,
  yellow/red cards, possession — the existing `stat_types` list for the sport).
- Each tile shows the team's season average, both perspectives: `5.8 for / 4.9 vs`
  (possession is `for` only — there's no "against" side for a percentage stat, matching
  the existing `unit === 'percent'` special-case in today's `page.tsx`).
- Tapping a tile marks it "selected" (default: first stat type in the list) and drives
  the chart area below. Only one stat is charted at a time.
- A stat with no covered matches shows "not enough data" on its tile instead of a number,
  consistent with the existing `EmptyState` pattern.

**Chart area:**
- One shared chart (reuses the existing `TrendChart` component) plus summary stats
  (`SummaryStats` component: average, min, max, over/under split) for whichever stat is
  currently selected.
- Filter controls for window (last5/last10/last20/season), venue (home/away/all), and
  opponent apply to the selected stat and live in the URL query string, e.g.
  `?stat=corners&perspective=against&window=last10&venue=home&opponent=<id>`.
- Switching the selected tile keeps the current window/venue/opponent filters and just
  swaps which stat's data is loaded — filters are not reset on tile switch.

## 3. Player page (`/team/[teamId]/player/[playerId]`) — designed now, built later

This section specifies the intended page so implementation is a smaller lift once
player-level stat ingestion exists; it is **not** built in the implementation pass that
follows this spec.

- Same shape as the team page's stats + chart sections: one tile per individual-level
  stat type (shots, shots on target, fouls, yellow/red cards, goals — no possession,
  no for/against split, since an individual player doesn't "concede" a stat), tapping a
  tile drives one shared chart below.
- Full filter parity with the team page: window, venue, **and** opponent filters all
  apply (decided explicitly over dropping venue/opponent for simplicity — they're still
  meaningful at the player level: home vs. away starts, performance vs. a given opponent).
- Blocked on: a player-level stat type list, player-level ingestion in the API-Football
  adapter, and a player-scoped equivalent of `getTrend` (team `perspective: 'against'`
  logic doesn't apply to a single player's own stat line).

## 4. Data / query layer changes

New/changed functions in `src/lib/queries/`:

- `getTeamStatSummary(teamId)` — **new.** Returns season average for/against per stat
  type for a team; powers the team page's stat tiles. Replaces the single-stat call the
  current homepage makes for its one selected stat.
- `getTrend(filters)` — **unchanged**, reused as-is for the shared chart on both the team
  and (future) player pages; `teamId` now comes from the route param instead of a
  form-selected value.
- `getDataCoverage(leagueId)` — **new.** Per-team count of matches-with-stats out of
  total matches in the league/season; powers the browse page badges.
- `getRoster(teamId)` — **new.** Reads the existing `players` table (currently unused by
  any query in the codebase); returns whatever rows exist, which may be zero today.
- Player-page-specific queries (`getPlayerStatSummary`, a player-scoped trend query) —
  **not written in this pass**; deferred alongside player-stat ingestion.

No schema or migration changes — this is a query-layer and page-structure change only.

## 5. Edge cases

- **Zero-coverage team:** still listed on the browse page (`0/38` badge); its team page
  renders with every stat tile showing "not enough data."
- **Empty roster:** Players section omitted from the team page rather than shown empty.
- **Player page reachability:** not an issue in practice — since roster links only exist
  when `getRoster` returns real rows, and no player-stat ingestion exists yet, there are
  no dangling links to a page with permanently missing data.
- **Missing stat values within a covered match:** unchanged from existing behavior —
  excluded from averages, never treated as zero (PRD §10.2).

## Testing notes

- `getTeamStatSummary` and `getDataCoverage` are new pure-ish query functions (Supabase
  reads + aggregation) — follow the existing `tests/` pattern used for
  `src/lib/queries/trends.ts` and `src/lib/stats/summary.ts`: unit-test any pure
  aggregation logic, integration-test the Supabase-touching parts against local Supabase
  if available.
- No changes to `src/lib/stats/summary.ts` or `src/lib/stats/lines.ts` — existing tests
  there stay valid as-is.
