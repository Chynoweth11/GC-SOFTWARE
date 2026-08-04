'use client'

import { useMemo, useState } from 'react'
import { BarChart, ChartFrame, LineChart } from '@/components/charts/primitives'
import { GRAIN_LABELS, RANGE_LABELS, bucketBy, withinRange, type Grain, type RangeKey } from '@/lib/finance/periods'

export interface PeriodPoint {
  /** ISO date string, so the value survives the server to client boundary. */
  date: string
  values: Record<string, number>
}

export interface PeriodSeries {
  key: string
  label: string
  color?: string
  /** Cumulative series are carried forward, not summed, when periods combine. */
  cumulative?: boolean
  area?: boolean
}

/**
 * A chart whose period can be changed.
 *
 * Monthly figures can be combined into quarters and years honestly: a flow like
 * billings adds up, and a running balance like cumulative cash takes the value
 * at the end of the period rather than the sum of it. Weekly is not offered
 * here, because the underlying rows are monthly and splitting them would mean
 * inventing the split.
 */
export function PeriodSeriesChart({
  points,
  series,
  asOf,
  title,
  subtitle,
  kind = 'bar',
  height = 250,
  defaultGrain = 'month',
  defaultRange = '12m',
  grains = ['month', 'quarter', 'year'],
  className,
}: {
  points: PeriodPoint[]
  series: PeriodSeries[]
  asOf: string
  title: string
  subtitle?: string
  kind?: 'bar' | 'line'
  height?: number
  defaultGrain?: Grain
  defaultRange?: RangeKey
  grains?: Grain[]
  className?: string
}) {
  const [grain, setGrain] = useState<Grain>(defaultGrain)
  const [range, setRange] = useState<RangeKey>(defaultRange)

  const { labels, values } = useMemo(() => {
    const rows = points.map((p) => ({ date: new Date(p.date), values: p.values }))
    const inRange = withinRange(rows, range, new Date(asOf))
    const buckets = bucketBy(inRange, grain)

    const out: Record<string, number[]> = {}
    for (const s of series) {
      out[s.key] = buckets.map((bucket) => {
        if (bucket.rows.length === 0) return 0
        if (s.cumulative) {
          // A running balance is whatever it stood at when the period closed.
          return bucket.rows[bucket.rows.length - 1].values[s.key] ?? 0
        }
        return bucket.rows.reduce((total, row) => total + (row.values[s.key] ?? 0), 0)
      })
    }
    return { labels: buckets.map((b) => b.label), values: out }
  }, [points, series, grain, range, asOf])

  const chartSeries = series.map((s) => ({
    key: s.key,
    label: s.label,
    values: values[s.key] ?? [],
    color: s.color,
    area: s.area,
  }))

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      className={className}
      action={
        <div className="flex flex-wrap items-center gap-1.5 no-print">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="field h-7 w-32 text-[11px]"
            aria-label={`${title} date range`}
          >
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <option key={key} value={key}>
                {RANGE_LABELS[key]}
              </option>
            ))}
          </select>
          <div className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border)' }} role="group" aria-label={`${title} grouping`}>
            {grains.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setGrain(key)}
                className="px-2 py-1 text-[11px] transition-colors"
                style={{
                  background: grain === key ? 'var(--accent-soft)' : 'transparent',
                  color: grain === key ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: grain === key ? 600 : 400,
                }}
              >
                {GRAIN_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
      }
    >
      {labels.length === 0 ? (
        <p className="py-8 text-center text-xs" style={{ color: 'var(--text-subtle)' }}>
          Nothing falls in this range.
        </p>
      ) : kind === 'line' ? (
        <LineChart labels={labels} height={height} format="moneyShort" series={chartSeries} />
      ) : (
        <BarChart labels={labels} height={height} format="moneyShort" series={chartSeries} />
      )}
    </ChartFrame>
  )
}
