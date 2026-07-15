import { describe, it, expect } from 'vitest'
import { computeTeamStatSummary } from '../src/lib/queries/team-summary'

const matches = [
  { id: 'm1', home_team_id: 'arsenal', away_team_id: 'chelsea' },
  { id: 'm2', home_team_id: 'spurs', away_team_id: 'arsenal' },
]

const statValues = [
  { match_id: 'm1', team_id: 'arsenal', stat_type_id: 'corners', value: 8 },
  { match_id: 'm1', team_id: 'chelsea', stat_type_id: 'corners', value: 3 },
  { match_id: 'm2', team_id: 'spurs', stat_type_id: 'corners', value: 5 },
  // arsenal's corners value for m2 is missing -> excluded from 'for' average, not zero
  { match_id: 'm1', team_id: 'arsenal', stat_type_id: 'fouls', value: 10 },
]

describe('computeTeamStatSummary', () => {
  it('averages the team\'s own values for "for" and the opponents\' values for "against"', () => {
    const [corners] = computeTeamStatSummary(matches, statValues, 'arsenal', ['corners'])
    expect(corners.forAverage).toBe(8)
    expect(corners.againstAverage).toBeCloseTo((3 + 5) / 2)
  })

  it('returns null for a side with no recorded values, without affecting the other side', () => {
    const [fouls] = computeTeamStatSummary(matches, statValues, 'arsenal', ['fouls'])
    expect(fouls.forAverage).toBe(10)
    expect(fouls.againstAverage).toBeNull()
  })

  it('returns null averages for a stat type with no data at all', () => {
    const [unknown] = computeTeamStatSummary(matches, statValues, 'arsenal', ['possession'])
    expect(unknown.forAverage).toBeNull()
    expect(unknown.againstAverage).toBeNull()
  })
})
