import { createClient } from '@/lib/supabase/server'

export async function getLeagues() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('leagues')
    .select('id, name, sport_id')
    .order('name')
  if (error) throw error
  return data
}

export async function getTeams(leagueId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id, name')
    .eq('league_id', leagueId)
    .order('name')
  if (error) throw error
  return data
}

export async function getStatTypes(sportId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('stat_types')
    .select('id, name, unit')
    .eq('sport_id', sportId)
    .order('name')
  if (error) throw error
  return data
}

export async function getRoster(teamId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('players')
    .select('id, name')
    .eq('team_id', teamId)
    .order('name')
  if (error) throw error
  return data
}

export async function getTeamWithLeague(teamId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, league_id, league:leagues!teams_league_id_fkey(id, name, sport_id)')
    .eq('id', teamId)
    .single()
  if (error) throw error
  return data
}
