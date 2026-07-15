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
