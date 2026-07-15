import type { TrendSummary } from '@/lib/stats/summary'

export default function SummaryStats({ summary }: { summary: TrendSummary }) {
  const fmt = (n: number | null) => (n === null ? '—' : n % 1 === 0 ? String(n) : n.toFixed(1))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Average" value={fmt(summary.average)} />
        <Tile label="Min" value={fmt(summary.min)} />
        <Tile label="Max" value={fmt(summary.max)} />
        <Tile
          label="Games"
          value={
            summary.gamesMissing > 0
              ? `${summary.gamesWithData} (${summary.gamesMissing} no data)`
              : String(summary.gamesWithData)
          }
        />
      </div>
      {summary.thresholds.length > 0 && summary.gamesWithData > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
            Over / under splits
          </h3>
          <div className="flex flex-wrap gap-2">
            {summary.thresholds.map((t) => (
              <span
                key={t.line}
                className="rounded-full border border-zinc-300 px-3 py-1 text-sm dark:border-zinc-700"
              >
                {t.line}: <strong>{t.overCount}</strong> over / <strong>{t.underCount}</strong> under
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}
