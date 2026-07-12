// Common prop lines per stat type id (seeded in supabase/migrations).
export const DEFAULT_LINES: Record<string, number[]> = {
  corners: [3.5, 4.5, 5.5, 6.5],
  shots: [10.5, 12.5, 14.5],
  shots_on_target: [3.5, 4.5, 5.5],
  fouls: [9.5, 10.5, 11.5],
  yellow_cards: [1.5, 2.5],
  red_cards: [0.5],
  possession: [50],
}

export function linesForStat(statTypeId: string): number[] {
  return DEFAULT_LINES[statTypeId] ?? []
}
