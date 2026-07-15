import type { ProviderAdapter } from '../types'
import { mapFixtures, mapStatistics, mapTeams } from './map'

const BASE_URL = 'https://v3.football.api-sports.io'

async function apiGet<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set')

  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url, { headers: { 'x-apisports-key': key } })
  if (!res.ok) throw new Error(`API-Football ${path} failed: ${res.status}`)

  const body = (await res.json()) as { errors: unknown; response: T[] }
  // API-Football returns 200 with an errors object on rate-limit/auth problems.
  if (body.errors && Object.keys(body.errors as object).length > 0) {
    throw new Error(`API-Football ${path} error: ${JSON.stringify(body.errors)}`)
  }
  return body.response
}

export const apiFootballAdapter: ProviderAdapter = {
  provider: 'api-football',

  async fetchTeams(leagueRef, season) {
    return mapTeams(await apiGet('/teams', { league: leagueRef, season }))
  },

  async fetchFixtures(leagueRef, season) {
    return mapFixtures(await apiGet('/fixtures', { league: leagueRef, season }))
  },

  async fetchMatchStats(providerMatchId) {
    return mapStatistics(await apiGet('/fixtures/statistics', { fixture: providerMatchId }))
  },
}
