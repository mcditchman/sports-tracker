
# PRD: Sports Prop Research Tool (MVP: Soccer)

## 1. Summary

A web app that helps sports bettors research prop-relevant statistical trends before placing a bet. The tool is a **statistics research dashboard, not a betting product** — it does not display odds, accept wagers, or move money. Users pick a team (and later a player), pick a stat (e.g. corners), pick a time window, and see the historical trend.

MVP scope is soccer only. The architecture must be built sport-agnostic so NBA, NFL, and NHL — and additional data providers — can be added later without a rework.

## 2. Problem & Goal

Bettors evaluating props (e.g. "will Team X take over 5.5 corners?") currently have to piece this together manually across stats sites. This tool centralizes historical stat data and surfaces it as a simple, filterable trend view, so a user can answer "how has this team/player performed on this specific stat recently?" in a few clicks.

**Goal:** Ship a soccer-only MVP that answers one question well: *"Show me [stat] for [team] over [time window]."*

## 3. Target User

Recreational sports bettors who bet or consider betting on props and want a quick statistical reference, not a full analytics platform. Not aimed at professional quants or syndicates.

## 4. Non-Goals (explicitly out of scope for MVP)

- No odds or betting lines (current or historical)
- No bet placement, account linking to sportsbooks, or money movement
- No player props (MVP is team-level stats only — see §6)
- No user accounts / auth (unless needed for a watchlist later)
- No saved watchlists, comparisons, or alerts (deferred — see §10)
- No NBA/NFL/NHL data (deferred, but architecture must not block adding them)
- No native mobile app (web only for MVP)

## 5. Core MVP Feature

**Single feature: Trend Charts & Filters**

A user can:
1. Select a league/competition (e.g. Premier League)
2. Select a team
3. Select a stat type (see §6 for MVP stat list)
4. Select a time window / filter (last 5 / 10 / 20 games, this season, home only, away only, vs. a specific opponent)
5. View the result as a trend chart (per-game bar/line chart) plus summary numbers (average, over/under-style split at common lines, min/max)

No comparison view, no saved state, no alerts in MVP — just query in, chart out.

## 6. MVP Stat Coverage (Soccer, Team-Level)

Pick stats that map to common soccer props:

| Stat | Notes |
|---|---|
| Corners taken | Primary example use case |
| Corners conceded | |
| Shots | |
| Shots on target | |
| Fouls committed | |
| Yellow/red cards | |
| Possession % | |

Player-level stats (shots, cards, goals per player) are a fast-follow, not MVP, but the data model should already support a "player" entity so this isn't a rebuild.

## 7. Data Source (MVP)

**Primary: API-Football (api-sports.io family)**
- Free tier: 100 requests/day, all endpoints, limited historical seasons — sufficient for prototyping
- Paid: $19/mo (7,500 req/day) or $29/mo (75,000 req/day) when ready to scale
- Relevant endpoints: fixtures, teams/statistics, players/statistics, leagues/standings
- Match-level statistics endpoint returns corners, shots, shots on target, cards, fouls, possession per team per match — this is the core data feed for MVP

**Alternative/backup:** Sportmonks (similar soccer-specific depth, useful if API-Football's rate limits or historical depth become a blocker).

**Compliance note:** Confirm API-Football's terms on caching/storing data long-term and any attribution requirements before public launch. This is a lighter lift than odds-data ToS since we're not redistributing pricing data, but still worth a read before shipping.

## 8. Deployment & Environment

- **Hosting:** Vercel (frontend/API routes) + Supabase (database, Postgres) — both projects already exist. Repo: `sports-tracker`.
- **Credentials:** API-Football key and Supabase connection details must be stored as environment variables (Vercel project env vars / `.env` locally), never committed to the repo, and never referenced from client-side code. All third-party API calls go through backend/server routes only.
- **Historical data range for MVP:** current season only (no prior-season backfill). This keeps the initial ingestion small; expanding to multiple seasons later is a config change (season range), not a schema change, per the data model in §9.

## 9. Architecture Requirements (must support future expansion)

Because soccer is just the first sport, design around these principles from day one:

**8.1 Sport-agnostic data model**
Avoid hardcoding "soccer" into table/entity names. Suggested core entities:
- `Sport` (soccer, basketball, football, hockey — extensible list)
- `League` (belongs to a Sport)
- `Team` (belongs to a League)
- `Player` (belongs to a Team) — modeled now even though unused until player stats ship
- `Match` (two Teams, a League, a date)
- `StatType` (name, unit, applicable Sport — e.g. "corners" only applies to soccer, "rebounds" only to basketball)
- `StatValue` (Match + Team or Player + StatType + numeric value)

This lets a query like "corners by Team X over last 10 games" and a future query like "rebounds by Player Y over last 10 games" run through the same query engine, just filtered by `StatType`.

**8.2 Provider adapter pattern**
Build a thin adapter/connector interface per data provider (e.g. `ApiFootballAdapter`) that maps that provider's response shape into the internal `Match`/`StatValue` schema. Adding a new sport or swapping/adding a provider (e.g. adding SportsDataIO for NBA later) means writing a new adapter, not touching the core schema or the frontend.

**8.3 Ingestion & caching**
- Scheduled job pulls fixtures/results/stats on a cadence appropriate to the free-tier rate limit (e.g. daily batch pull of completed matches, since MVP is historical trend viewing, not live in-play data)
- Store normalized data in the app's own database; the frontend never calls the third-party API directly
- This also protects against future API cost/rate-limit changes and keeps response times fast

**8.4 Suggested stack (Fable 5 can finalize)**
- Backend: any standard REST/GraphQL API service with a scheduled job/worker for ingestion
- Database: relational (Postgres) fits the entity model in §8.1 well
- Frontend: web app with a charting library for the trend view (e.g. line/bar charts with filter controls)
- No specific framework mandate — left to the builder's judgment, but the data model and adapter pattern above are the hard requirements

## 10. Key User Flow (MVP)

1. Land on homepage → select Sport (only "Soccer" selectable in MVP, but UI should show the selector as if more will come)
2. Select League → Team
3. Select Stat (corners, shots, etc.)
4. Select filter (last N games / season / home-away / vs. opponent)
5. View trend chart + summary stats (average, min, max, count over/under common thresholds like 4.5/5.5/6.5 corners)

### 10.1 Screens (MVP)

1. **Home / Sport & League select** — sport selector (soccer only, active), league selector (Premier League only, active)
2. **Team & Stat picker** — choose team, choose stat type, choose filter (last N games / season / home-away / opponent)
3. **Results view** — trend chart (per-game bar/line) + summary stats (average, min, max, over/under split at common thresholds)

No auth screens, no settings, no saved-state screens in MVP.

### 10.2 Edge Cases to Handle

- **No data yet for a team** (e.g. early season, or a stat wasn't recorded for a given match): show an explicit "not enough data" state rather than a blank or broken chart.
- **API/ingestion failure:** if the scheduled data pull fails, serve the last successfully cached data rather than erroring the whole app; log the failure for follow-up.
- **Mid-season stat gaps:** if a specific match is missing a stat value (provider data gap), exclude it from averages rather than treating it as zero.

## 11. Deferred / Future Roadmap (explicitly not MVP, but architecture should not block these)

- Add NBA, NFL, NHL (new adapters + new StatType rows)
- Player-level stat views
- Side-by-side team/player comparisons
- Saved watchlists (requires basic auth)
- Threshold alerts/notifications
- Odds/props line integration (requires separate ToS review — The Odds API Business tier ($99/mo) covers player props for NBA/NHL/MLB/NFL-in-season if/when this is added)
- Mobile app

## 12. Success Criteria for MVP

- User can complete the full flow (league → team → stat → filter → chart) for every Premier League team without errors
- Historical data covers the current season for trend context
- Page load / query response feels instant (data is pre-ingested, not live-fetched from the third-party API on each request)
- Successfully deployed and reachable via Vercel, reading/writing from Supabase

## 13. Open Risks / Questions

- **Rate limits on free tier:** 100 req/day may require careful batching during initial data backfill.
- **Data provider ToS:** confirm caching/storage terms before any public launch, even without odds involved.
- **Confirmed for MVP:** Premier League only, current season only, deployed via Vercel + Supabase (repo: `sports-tracker`).
