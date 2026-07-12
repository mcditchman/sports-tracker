import { describe, it, expect } from 'vitest'
import { assemblePoints } from '../src/lib/queries/assemble'

const matches = [
  {
    id: 'm1',
    kickoff_at: '2026-01-10T15:00:00Z',
    home_team_id: 'arsenal',
    away_team_id: 'chelsea',
    home_name: 'Arsenal',
    away_name: 'Chelsea',
  },
  {
    id: 'm2',
    kickoff_at: '2026-01-17T15:00:00Z',
    home_team_id: 'spurs',
    away_team_id: 'arsenal',
    home_name: 'Spurs',
    away_name: 'Arsenal',
  },
]

const statValues = [
  { match_id: 'm1', team_id: 'arsenal', value: 8 },
  { match_id: 'm1', team_id: 'chelsea', value: 3 },
  { match_id: 'm2', team_id: 'spurs', value: 5 },
  // arsenal value for m2 missing → data gap
]

describe('assemblePoints', () => {
  it("perspective 'for' returns the team's own values with venue and opponent", () => {
    const points = assemblePoints(matches, statValues, 'arsenal', 'for')
    expect(points).toEqual([
      { matchId: 'm1', date: '2026-01-10T15:00:00Z', opponentName: 'Chelsea', venue: 'home', value: 8 },
      { matchId: 'm2', date: '2026-01-17T15:00:00Z', opponentName: 'Spurs', venue: 'away', value: null },
    ])
  })

  it("perspective 'against' returns the opponent's values (conceded)", () => {
    const points = assemblePoints(matches, statValues, 'arsenal', 'against')
    expect(points[0].value).toBe(3) // Chelsea's corners = corners conceded by Arsenal
    expect(points[1].value).toBe(5) // Spurs' corners
  })
})
