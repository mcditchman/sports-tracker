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

  // Matches supabase/config.toml's `max_rows = 1000` PostgREST cap; keep in sync if that changes.
  const PAGE_SIZE = 1000
  const matchIds = matches.map((m) => m.id)
  const statValues: { match_id: string; team_id: string | null }[] = []
  let offset = 0
  while (true) {
    const { data: page, error: statError } = await supabase
      .from('stat_values')
      .select('match_id, team_id')
      .in('match_id', matchIds)
      .is('player_id', null)
      .order('id') // unique primary key -> total order, required for stable range() pagination
      .range(offset, offset + PAGE_SIZE - 1)
    if (statError) throw statError

    statValues.push(...(page ?? []))
    if (!page || page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return computeDataCoverage(
    matches,
    statValues.flatMap((s) =>
      s.team_id === null ? [] : [{ match_id: s.match_id, team_id: s.team_id }]
    ),
    teamIds
  )
}
