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
