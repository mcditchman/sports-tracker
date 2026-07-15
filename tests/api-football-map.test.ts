import { describe, it, expect } from 'vitest'
import { mapTeams, mapFixtures, mapStatistics } from '../src/lib/providers/api-football/map'

const teamsResponse = [
  { team: { id: 42, name: 'Arsenal' } },
  { team: { id: 49, name: 'Chelsea' } },
]

const fixturesResponse = [
  {
    fixture: { id: 1035037, date: '2026-04-11T14:00:00+00:00', status: { short: 'FT' } },
    teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
  },
  {
    fixture: { id: 1035099, date: '2026-08-15T14:00:00+00:00', status: { short: 'NS' } },
    teams: { home: { id: 49, name: 'Chelsea' }, away: { id: 42, name: 'Arsenal' } },
  },
  {
    fixture: { id: 1035100, date: '2026-04-12T14:00:00+00:00', status: { short: 'PST' } },
    teams: { home: { id: 42, name: 'Arsenal' }, away: { id: 49, name: 'Chelsea' } },
  },
]

const statisticsResponse = [
  {
    team: { id: 42, name: 'Arsenal' },
    statistics: [
      { type: 'Corner Kicks', value: 8 },
      { type: 'Total Shots', value: 15 },
      { type: 'Shots on Goal', value: 6 },
      { type: 'Fouls', value: 11 },
      { type: 'Yellow Cards', value: 2 },
      { type: 'Red Cards', value: null },
      { type: 'Ball Possession', value: '58%' },
      { type: 'Offsides', value: 3 },
    ],
  },
  {
    team: { id: 49, name: 'Chelsea' },
    statistics: [
      { type: 'Corner Kicks', value: 3 },
      { type: 'Ball Possession', value: '42%' },
    ],
  },
]

describe('mapTeams', () => {
  it('maps provider teams to normalized teams', () => {
    expect(mapTeams(teamsResponse)).toEqual([
      { providerTeamId: '42', name: 'Arsenal' },
      { providerTeamId: '49', name: 'Chelsea' },
    ])
  })
})

describe('mapFixtures', () => {
  it('maps fixtures with normalized status', () => {
    const fixtures = mapFixtures(fixturesResponse)
    expect(fixtures).toHaveLength(3)
    expect(fixtures[0]).toEqual({
      providerMatchId: '1035037',
      kickoffAt: '2026-04-11T14:00:00+00:00',
      status: 'finished',
      homeProviderTeamId: '42',
      homeName: 'Arsenal',
      awayProviderTeamId: '49',
      awayName: 'Chelsea',
    })
    expect(fixtures[1].status).toBe('scheduled')
    expect(fixtures[2].status).toBe('other')
  })
})

describe('mapStatistics', () => {
  it('maps known stat types, parses possession %, skips nulls and unknown types', () => {
    const lines = mapStatistics(statisticsResponse)
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'corners', value: 8 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'shots', value: 15 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'shots_on_target', value: 6 })
    expect(lines).toContainEqual({ providerTeamId: '42', statTypeId: 'possession', value: 58 })
    expect(lines).toContainEqual({ providerTeamId: '49', statTypeId: 'possession', value: 42 })
    // null Red Cards → gap, not zero (PRD §10.2)
    expect(lines.find((l) => l.providerTeamId === '42' && l.statTypeId === 'red_cards')).toBeUndefined()
    // unknown provider types are ignored
    expect(lines.find((l) => l.statTypeId === 'offsides')).toBeUndefined()
  })
})
