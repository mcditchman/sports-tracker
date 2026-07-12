import { describe, it, expect } from 'vitest'
import { computeTrendSummary, type GamePoint } from '../src/lib/stats/summary'

function pt(value: number | null, i = 0): GamePoint {
  return {
    matchId: `m${i}`,
    date: `2026-01-0${i + 1}`,
    opponentName: 'Opp',
    venue: 'home',
    value,
  }
}

describe('computeTrendSummary', () => {
  it('computes average, min, max over games with data', () => {
    const s = computeTrendSummary([pt(4, 0), pt(8, 1), pt(6, 2)], [5.5])
    expect(s.gamesWithData).toBe(3)
    expect(s.gamesMissing).toBe(0)
    expect(s.average).toBeCloseTo(6)
    expect(s.min).toBe(4)
    expect(s.max).toBe(8)
  })

  it('excludes null values from all aggregates (never treats gaps as zero)', () => {
    const s = computeTrendSummary([pt(4, 0), pt(null, 1), pt(8, 2)], [5.5])
    expect(s.gamesWithData).toBe(2)
    expect(s.gamesMissing).toBe(1)
    expect(s.average).toBeCloseTo(6)
    expect(s.min).toBe(4)
  })

  it('counts over/under per line, excluding exact ties and nulls', () => {
    const s = computeTrendSummary([pt(4, 0), pt(6, 1), pt(null, 2), pt(5, 3)], [4.5, 5.0])
    const l45 = s.thresholds.find((t) => t.line === 4.5)!
    expect(l45.overCount).toBe(2) // 6 and 5
    expect(l45.underCount).toBe(1) // 4
    const l50 = s.thresholds.find((t) => t.line === 5.0)!
    expect(l50.overCount).toBe(1) // 6
    expect(l50.underCount).toBe(1) // 4; the exact 5 is a tie, excluded
  })

  it('returns null aggregates and empty-safe output for no data', () => {
    const s = computeTrendSummary([pt(null, 0)], [5.5])
    expect(s.gamesWithData).toBe(0)
    expect(s.average).toBeNull()
    expect(s.min).toBeNull()
    expect(s.max).toBeNull()
    expect(s.thresholds[0]).toEqual({ line: 5.5, overCount: 0, underCount: 0 })
  })
})
