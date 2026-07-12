import type { NormalizedFixture, NormalizedStatLine, NormalizedTeam } from '../types'

// API-Football v3 response item shapes (only the fields we read).
interface ApiTeamItem {
  team: { id: number; name: string }
}

interface ApiFixtureItem {
  fixture: { id: number; date: string; status: { short: string } }
  teams: { home: { id: number; name: string }; away: { id: number; name: string } }
}

interface ApiStatisticsItem {
  team: { id: number; name: string }
  statistics: { type: string; value: number | string | null }[]
}

const FINISHED = new Set(['FT', 'AET', 'PEN'])
const SCHEDULED = new Set(['NS', 'TBD'])

const STAT_TYPE_MAP: Record<string, string> = {
  'Corner Kicks': 'corners',
  'Total Shots': 'shots',
  'Shots on Goal': 'shots_on_target',
  Fouls: 'fouls',
  'Yellow Cards': 'yellow_cards',
  'Red Cards': 'red_cards',
  'Ball Possession': 'possession',
}

export function mapTeams(items: ApiTeamItem[]): NormalizedTeam[] {
  return items.map((i) => ({ providerTeamId: String(i.team.id), name: i.team.name }))
}

export function mapFixtures(items: ApiFixtureItem[]): NormalizedFixture[] {
  return items.map((i) => ({
    providerMatchId: String(i.fixture.id),
    kickoffAt: i.fixture.date,
    status: FINISHED.has(i.fixture.status.short)
      ? 'finished'
      : SCHEDULED.has(i.fixture.status.short)
        ? 'scheduled'
        : 'other',
    homeProviderTeamId: String(i.teams.home.id),
    homeName: i.teams.home.name,
    awayProviderTeamId: String(i.teams.away.id),
    awayName: i.teams.away.name,
  }))
}

export function mapStatistics(items: ApiStatisticsItem[]): NormalizedStatLine[] {
  const lines: NormalizedStatLine[] = []
  for (const item of items) {
    for (const stat of item.statistics) {
      const statTypeId = STAT_TYPE_MAP[stat.type]
      if (!statTypeId || stat.value === null) continue // gaps stay gaps (PRD §10.2)
      const value =
        typeof stat.value === 'string' ? Number.parseFloat(stat.value) : stat.value
      if (Number.isNaN(value)) continue
      lines.push({ providerTeamId: String(item.team.id), statTypeId, value })
    }
  }
  return lines
}
