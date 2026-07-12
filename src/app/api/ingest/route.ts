import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { apiFootballAdapter } from '@/lib/providers/api-football/adapter'
import { PROVIDER, SEASON } from '@/lib/config'

export const maxDuration = 300

const LEAGUE_REF = '39' // Premier League; matches the seed row in leagues

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const limit = Math.max(
    1,
    Math.min(90, Number(request.nextUrl.searchParams.get('limit') ?? 80))
  )
  const db = createAdminClient()

  try {
    const { data: league, error: leagueError } = await db
      .from('leagues')
      .select('id')
      .eq('provider', PROVIDER)
      .eq('provider_league_id', LEAGUE_REF)
      .single()
    if (leagueError || !league) throw new Error('League seed row missing')

    // 1. Teams (1 API request)
    const teams = await apiFootballAdapter.fetchTeams(LEAGUE_REF, SEASON)
    const { error: teamsError } = await db.from('teams').upsert(
      teams.map((t) => ({
        league_id: league.id,
        name: t.name,
        provider: PROVIDER,
        provider_team_id: t.providerTeamId,
      })),
      { onConflict: 'provider,provider_team_id' }
    )
    if (teamsError) throw teamsError

    const { data: teamRows, error: teamRowsError } = await db
      .from('teams')
      .select('id, provider_team_id')
      .eq('provider', PROVIDER)
    if (teamRowsError) throw teamRowsError
    const teamIdByRef = new Map(teamRows.map((t) => [t.provider_team_id, t.id]))

    // 2. Fixtures (1 API request)
    const fixtures = await apiFootballAdapter.fetchFixtures(LEAGUE_REF, SEASON)
    const matchRows = fixtures.flatMap((f) => {
      const home = teamIdByRef.get(f.homeProviderTeamId)
      const away = teamIdByRef.get(f.awayProviderTeamId)
      if (!home || !away) return []
      return [
        {
          league_id: league.id,
          season: SEASON,
          home_team_id: home,
          away_team_id: away,
          kickoff_at: f.kickoffAt,
          status: f.status,
          provider: PROVIDER,
          provider_match_id: f.providerMatchId,
        },
      ]
    })
    const { error: matchesError } = await db
      .from('matches')
      .upsert(matchRows, { onConflict: 'provider,provider_match_id' })
    if (matchesError) throw matchesError

    // 3. Stats for finished matches that don't have them yet
    // (batched to stay inside the 100 req/day free tier)
    const { data: finished, error: finishedError } = await db
      .from('matches')
      .select('id, provider_match_id, stat_values(id)')
      .eq('provider', PROVIDER)
      .eq('status', 'finished')
      .order('kickoff_at', { ascending: false })
    if (finishedError) throw finishedError

    const pending = finished.filter((m) => m.stat_values.length === 0)
    const batch = pending.slice(0, limit)

    for (const match of batch) {
      const lines = await apiFootballAdapter.fetchMatchStats(match.provider_match_id)
      if (lines.length === 0) continue
      const { error: statError } = await db.from('stat_values').upsert(
        lines.flatMap((l) => {
          const teamId = teamIdByRef.get(l.providerTeamId)
          if (!teamId) return []
          return [
            {
              match_id: match.id,
              team_id: teamId,
              stat_type_id: l.statTypeId,
              value: l.value,
            },
          ]
        }),
        { onConflict: 'match_id,stat_type_id,team_id' }
      )
      if (statError) throw statError
    }

    return NextResponse.json({
      teams: teams.length,
      matches: matchRows.length,
      statsFetched: batch.length,
      statsRemaining: pending.length - batch.length,
    })
  } catch (err) {
    // Reads keep serving the last ingested data; only this refresh fails.
    console.error('Ingestion failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
