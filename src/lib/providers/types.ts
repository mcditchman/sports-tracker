export interface NormalizedTeam {
  providerTeamId: string
  name: string
}

export interface NormalizedFixture {
  providerMatchId: string
  kickoffAt: string // ISO timestamp
  status: 'finished' | 'scheduled' | 'other'
  homeProviderTeamId: string
  homeName: string
  awayProviderTeamId: string
  awayName: string
}

export interface NormalizedStatLine {
  providerTeamId: string
  statTypeId: string
  value: number
}

export interface ProviderAdapter {
  provider: string
  fetchTeams(leagueRef: string, season: string): Promise<NormalizedTeam[]>
  fetchFixtures(leagueRef: string, season: string): Promise<NormalizedFixture[]>
  fetchMatchStats(providerMatchId: string): Promise<NormalizedStatLine[]>
}
