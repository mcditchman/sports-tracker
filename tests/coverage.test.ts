import { describe, it, expect } from 'vitest'
import { computeDataCoverage } from '../src/lib/queries/coverage'

const matches = [
  { id: 'm1', home_team_id: 'arsenal', away_team_id: 'chelsea' },
  { id: 'm2', home_team_id: 'spurs', away_team_id: 'arsenal' },
  { id: 'm3', home_team_id: 'arsenal', away_team_id: 'spurs' },
]

const coverageRows = [
  { match_id: 'm1', team_id: 'arsenal' },
  { match_id: 'm1', team_id: 'chelsea' },
  { match_id: 'm2', team_id: 'spurs' },
  // arsenal has no stat row for m2 -> not covered; m3 has no rows at all
]

describe('computeDataCoverage', () => {
  it('counts total matches and covered matches per team', () => {
    const result = computeDataCoverage(matches, coverageRows, ['arsenal', 'chelsea', 'spurs'])
    expect(result).toEqual([
      { teamId: 'arsenal', totalMatches: 3, coveredMatches: 1 },
      { teamId: 'chelsea', totalMatches: 1, coveredMatches: 1 },
      { teamId: 'spurs', totalMatches: 2, coveredMatches: 1 },
    ])
  })

  it('returns zero coverage for a team with no matches', () => {
    const result = computeDataCoverage(matches, coverageRows, ['everton'])
    expect(result).toEqual([{ teamId: 'everton', totalMatches: 0, coveredMatches: 0 }])
  })
})
