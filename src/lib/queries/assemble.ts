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
