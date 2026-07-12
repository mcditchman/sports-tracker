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
