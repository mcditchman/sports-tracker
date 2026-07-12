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
