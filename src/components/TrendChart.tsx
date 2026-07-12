'use client'

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { GamePoint } from '@/lib/stats/summary'

interface Props {
  points: GamePoint[]
  statLabel: string
  average: number | null
}

export default function TrendChart({ points, statLabel, average }: Props) {
  const data = points.map((p) => ({
    label: `${p.venue === 'home' ? 'vs' : '@'} ${p.opponentName}`,
    date: new Date(p.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    value: p.value,
  }))

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [value ?? 'No data', statLabel]}
            labelFormatter={(_, payload) =>
              payload?.[0] ? `${payload[0].payload.label} (${payload[0].payload.date})` : ''
            }
          />
          {average !== null && (
            <ReferenceLine
              y={average}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              label={{ value: `avg ${average.toFixed(1)}`, fontSize: 12, position: 'right' }}
            />
          )}
          <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
