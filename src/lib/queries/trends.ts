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
    (statValues ?? []).flatMap((s) =>
      s.team_id === null ? [] : [{ match_id: s.match_id, team_id: s.team_id, value: Number(s.value) }]
    ),
    teamId,
    filters.perspective
  )

  // chronological for the chart
  return points.reverse()
}
