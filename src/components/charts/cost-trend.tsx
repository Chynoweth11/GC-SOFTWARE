'use client'

import { useMemo, useState } from 'react'
import { BarChart, ChartFrame } from '@/components/charts/primitives'
import { GRAIN_LABELS, RANGE_LABELS, sumBuckets, withinRange, type Grain, type RangeKey } from '@/lib/finance/periods'
import { money } from '@/lib/format'

export interface TrendPoint {
  /** ISO date string, so the value survives the server to client boundary. */
  date: string
  amount: number
  accrual?: boolean
}

/**
 * Cost over time, grouped the way you ask for it.
 *
 * Built from the transaction dates themselves rather than from a stored monthly
 * summary, which is what makes a weekly view real: every bucket is the sum of
 * the transactions that actually fall inside it.
 */
export function CostTrend({
  points,
  asOf,
  title = 'Cost over time',
  subtitle = 'Posted from the transaction ledger, grouped by period',
  defaultGrain = 'month',
  defaultRange = '12m',
}: {
  points: TrendPoint[]
  asOf: string
  title?: string
  subtitle?: string
  defaultGrain?: Grain
  defaultRange?: RangeKey
}) {
  const [grain, setGrain] = useState<Grain>(defaultGrain)
  const [range, setRange] = useState<RangeKey>(defaultRange)

  const { labels, actual, accrued, total, periods } = useMemo(() => {
    const rows = points.map((p) => ({ date: new Date(p.date), amount: p.amount, accrual: p.accrual === true }))
    const inRange = withinRange(rows, range, new Date(asOf))
    const actualBuckets = sumBuckets(inRange, grain, (r) => (r.accrual ? 0 : r.amount))
    const accrualBuckets = sumBuckets(inRange, grain, (r) => (r.accrual ? r.amount : 0))
    return {
      labels: actualBuckets.map((b) => b.label),
      actual: actualBuckets.map((b) => b.value),
      accrued: accrualBuckets.map((b) => b.value),
      total: inRange.reduce((sum, r) => sum + r.amount, 0),
      periods: actualBuckets.length,
    }
  }, [points, grain, range, asOf])

  const hasAccruals = accrued.some((v) => v !== 0)

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap items-center gap-1.5 no-print">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as RangeKey)}
            className="field h-7 w-36 text-[11px]"
            aria-label="Date range"
          >
            {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
              <option key={key} value={key}>
                {RANGE_LABELS[key]}
              </option>
            ))}
          </select>
          <div
            className="inline-flex overflow-hidden rounded-lg border"
            style={{ borderColor: 'var(--border)' }}
            role="group"
            aria-label="Group by"
          >
            {(Object.keys(GRAIN_LABELS) as Grain[]).map((key) => (
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
          No cost posted in this range.
        </p>
      ) : (
        <>
          <BarChart
            labels={labels}
            height={230}
            format="moneyShort"
            series={[
              { key: 'actual', label: 'Actual cost', values: actual, color: 'var(--accent)' },
              ...(hasAccruals ? [{ key: 'accrued', label: 'Accrued', values: accrued, color: 'var(--caution)' }] : []),
            ]}
          />
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            {money(total)} across {periods} {periods === 1 ? 'period' : 'periods'}, {RANGE_LABELS[range].toLowerCase()}.
          </p>
        </>
      )}
    </ChartFrame>
  )
}
