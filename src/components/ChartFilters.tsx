'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Option {
  value: string
  label: string
}

const WINDOWS: Option[] = [
  { value: 'last5', label: 'Last 5 games' },
  { value: 'last10', label: 'Last 10 games' },
  { value: 'last20', label: 'Last 20 games' },
  { value: 'season', label: 'This season' },
]

const VENUES: Option[] = [
  { value: 'all', label: 'Home & away' },
  { value: 'home', label: 'Home only' },
  { value: 'away', label: 'Away only' },
]

export default function ChartFilters({
  teamId,
  opponents,
}: {
  teamId: string
  opponents: Option[]
}) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(param: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    router.push(`/team/${teamId}?${next.toString()}`)
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Window</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={params.get('window') ?? 'last10'}
          onChange={(e) => setParam('window', e.target.value)}
        >
          {WINDOWS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Venue</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={params.get('venue') ?? 'all'}
          onChange={(e) => setParam('venue', e.target.value)}
        >
          {VENUES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-600 dark:text-zinc-300">Opponent</span>
        <select
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 disabled:opacity-50"
          value={params.get('opponent') ?? ''}
          disabled={opponents.length === 0}
          onChange={(e) => setParam('opponent', e.target.value)}
        >
          <option value="">Any opponent</option>
          {opponents.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
