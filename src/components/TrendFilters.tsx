'use client'

import { useRouter, useSearchParams } from 'next/navigation'

interface Option {
  value: string
  label: string
}

interface Props {
  leagues: Option[]
  teams: Option[]
  stats: Option[] // includes both "X (for)" (id) and "X (conceded)" (id:against) options
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

function Select({
  label,
  param,
  options,
  value,
  placeholder,
  onChange,
  disabled,
}: {
  label: string
  param: string
  options: Option[]
  value: string
  placeholder?: string
  onChange: (param: string, value: string) => void
  disabled?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-zinc-600 dark:text-zinc-300">{label}</span>
      <select
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900 disabled:opacity-50"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(param, e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function TrendFilters({ leagues, teams, stats }: Props) {
  const router = useRouter()
  const params = useSearchParams()

  function setParam(param: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(param, value)
    else next.delete(param)
    // changing league invalidates team/opponent selections
    if (param === 'league') {
      next.delete('team')
      next.delete('opponent')
    }
    router.push(`/?${next.toString()}`)
  }

  const opponents = teams.filter((t) => t.value !== (params.get('team') ?? ''))

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-7">
      <Select
        label="Sport"
        param="sport"
        options={[{ value: 'soccer', label: 'Soccer' }]}
        value="soccer"
        onChange={() => {}}
      />
      <Select
        label="League"
        param="league"
        options={leagues}
        value={params.get('league') ?? ''}
        placeholder="Select league"
        onChange={setParam}
      />
      <Select
        label="Team"
        param="team"
        options={teams}
        value={params.get('team') ?? ''}
        placeholder="Select team"
        onChange={setParam}
        disabled={teams.length === 0}
      />
      <Select
        label="Stat"
        param="stat"
        options={stats}
        value={params.get('stat') ?? ''}
        placeholder="Select stat"
        onChange={setParam}
      />
      <Select
        label="Window"
        param="window"
        options={WINDOWS}
        value={params.get('window') ?? 'last10'}
        onChange={setParam}
      />
      <Select
        label="Venue"
        param="venue"
        options={VENUES}
        value={params.get('venue') ?? 'all'}
        onChange={setParam}
      />
      <Select
        label="Opponent"
        param="opponent"
        options={opponents}
        value={params.get('opponent') ?? ''}
        placeholder="Any opponent"
        onChange={setParam}
        disabled={opponents.length === 0}
      />
    </div>
  )
}
