export interface GamePoint {
  matchId: string
  date: string
  opponentName: string
  venue: 'home' | 'away'
  value: number | null
}

export interface ThresholdSplit {
  line: number
  overCount: number
  underCount: number
}

export interface TrendSummary {
  gamesWithData: number
  gamesMissing: number
  average: number | null
  min: number | null
  max: number | null
  thresholds: ThresholdSplit[]
}

export function computeTrendSummary(points: GamePoint[], lines: number[]): TrendSummary {
  const values = points
    .map((p) => p.value)
    .filter((v): v is number => v !== null)

  const thresholds = lines.map((line) => ({
    line,
    overCount: values.filter((v) => v > line).length,
    underCount: values.filter((v) => v < line).length,
  }))

  return {
    gamesWithData: values.length,
    gamesMissing: points.length - values.length,
    average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    thresholds,
  }
}
