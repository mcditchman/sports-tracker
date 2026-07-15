'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export interface StatTileData {
  statTypeId: string
  label: string
  unit: 'count' | 'percent'
  forAverage: number | null
  againstAverage: number | null
}

function fmt(n: number | null): string {
  return n === null ? '—' : n % 1 === 0 ? String(n) : n.toFixed(1)
}

export default function StatTiles({
  teamId,
  tiles,
  selectedStatTypeId,
  selectedPerspective,
}: {
  teamId: string
  tiles: StatTileData[]
  selectedStatTypeId: string
  selectedPerspective: 'for' | 'against'
}) {
  const router = useRouter()
  const params = useSearchParams()

  function select(statTypeId: string, perspective: 'for' | 'against') {
    const next = new URLSearchParams(params.toString())
    next.set('stat', statTypeId)
    next.set('perspective', perspective)
    router.push(`/team/${teamId}?${next.toString()}`)
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.statTypeId} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-1 text-xs uppercase tracking-wide text-zinc-500">{tile.label}</div>
          <div className="flex items-baseline gap-3 text-lg font-semibold">
            <button
              type="button"
              onClick={() => select(tile.statTypeId, 'for')}
              className={
                selectedStatTypeId === tile.statTypeId && selectedPerspective === 'for'
                  ? 'underline decoration-2 underline-offset-4'
                  : ''
              }
            >
              {fmt(tile.forAverage)}
              {tile.unit === 'percent' && tile.forAverage !== null ? '%' : ''}
            </button>
            {tile.unit !== 'percent' && (
              <button
                type="button"
                onClick={() => select(tile.statTypeId, 'against')}
                className={
                  (selectedStatTypeId === tile.statTypeId && selectedPerspective === 'against'
                    ? 'underline decoration-2 underline-offset-4 '
                    : '') + 'text-sm text-zinc-500'
                }
              >
                {fmt(tile.againstAverage)} vs
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
