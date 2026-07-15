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
