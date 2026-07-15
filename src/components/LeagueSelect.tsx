'use client'

import { useRouter } from 'next/navigation'

interface Option {
  value: string
  label: string
}

export default function LeagueSelect({
  leagues,
  selectedLeagueId,
}: {
  leagues: Option[]
  selectedLeagueId: string
}) {
  const router = useRouter()

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">League</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        value={selectedLeagueId}
        onChange={(e) => router.push(`/?league=${e.target.value}`)}
      >
        {leagues.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  )
}
