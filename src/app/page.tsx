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
