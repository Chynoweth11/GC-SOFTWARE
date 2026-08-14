/**
 * Grouping dated amounts into weeks, months, quarters and years.
 *
 * Everything works in UTC so a bucket does not shift with the reader's time
 * zone, and every boundary is inclusive of its own period end. Weekly buckets
 * are only offered where the underlying records carry a real date: a monthly
 * cash-flow curve cannot be split into weeks without inventing the split, and
 * this module will not do that.
 *
 * Not part of the `finance` barrel, and deliberately so: these are chart
 * groupings rather than financial engines, and keeping them out means the
 * dashboard's bucketing cannot be mistaken for something a figure depends on.
 */

import { startOfMonth } from './dates'

export type Grain = 'week' | 'month' | 'quarter' | 'year'

export const GRAIN_LABELS: Record<Grain, string> = {
  week: 'Weekly',
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Yearly',
}

/** Monday of the week the date falls in, at midnight UTC. */
export function startOfWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = (d.getUTCDay() + 6) % 7 // Monday is 0
  d.setUTCDate(d.getUTCDate() - day)
  return d
}

export function startOfQuarter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1))
}

export function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

export function bucketStart(date: Date, grain: Grain): Date {
  switch (grain) {
    case 'week':
      return startOfWeek(date)
    case 'month':
      return startOfMonth(date)
    case 'quarter':
      return startOfQuarter(date)
    case 'year':
      return startOfYear(date)
  }
}

const WEEK_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** How a bucket reads on an axis. */
export function bucketLabel(start: Date, grain: Grain): string {
  switch (grain) {
    case 'week':
      return `w/c ${WEEK_LABEL.format(start)}`
    case 'month':
      return MONTH_LABEL.format(start)
    case 'quarter':
      return `Q${Math.floor(start.getUTCMonth() / 3) + 1} ${start.getUTCFullYear()}`
    case 'year':
      return String(start.getUTCFullYear())
  }
}

export interface Dated {
  date: Date
}

export interface Bucket<T> {
  start: Date
  label: string
  rows: T[]
}

/**
 * Groups rows into consecutive buckets.
 *
 * Empty periods are included so a gap in trading reads as a gap on the chart
 * rather than two bars sitting misleadingly side by side.
 */
export function bucketBy<T extends Dated>(rows: readonly T[], grain: Grain): Bucket<T>[] {
  if (rows.length === 0) return []

  const byKey = new Map<number, T[]>()
  for (const row of rows) {
    const key = bucketStart(row.date, grain).getTime()
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  const keys = [...byKey.keys()].sort((a, b) => a - b)
  const buckets: Bucket<T>[] = []
  let cursor = new Date(keys[0])
  const last = new Date(keys[keys.length - 1])

  while (cursor.getTime() <= last.getTime()) {
    buckets.push({
      start: new Date(cursor),
      label: bucketLabel(cursor, grain),
      rows: byKey.get(cursor.getTime()) ?? [],
    })
    cursor = nextBucket(cursor, grain)
  }
  return buckets
}

export function nextBucket(start: Date, grain: Grain): Date {
  const d = new Date(start)
  switch (grain) {
    case 'week':
      d.setUTCDate(d.getUTCDate() + 7)
      break
    case 'month':
      d.setUTCMonth(d.getUTCMonth() + 1)
      break
    case 'quarter':
      d.setUTCMonth(d.getUTCMonth() + 3)
      break
    case 'year':
      d.setUTCFullYear(d.getUTCFullYear() + 1)
      break
  }
  return d
}

export type RangeKey = 'ytd' | '3m' | '6m' | '12m' | '24m' | 'all'

export const RANGE_LABELS: Record<RangeKey, string> = {
  ytd: 'Year to date',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '12m': 'Last 12 months',
  '24m': 'Last 24 months',
  all: 'All time',
}

/**
 * The earliest date a range admits, measured back from the data date rather
 * than from today, so a report run in June against a March data date still
 * shows the three months that actually have figures in them.
 */
export function rangeStart(range: RangeKey, asOf: Date): Date | null {
  if (range === 'all') return null
  if (range === 'ytd') return startOfYear(asOf)
  const months = range === '3m' ? 3 : range === '6m' ? 6 : range === '12m' ? 12 : 24
  const d = startOfMonth(asOf)
  d.setUTCMonth(d.getUTCMonth() - (months - 1))
  return d
}

export function withinRange<T extends Dated>(rows: readonly T[], range: RangeKey, asOf: Date): T[] {
  const from = rangeStart(range, asOf)
  if (!from) return [...rows]
  return rows.filter((row) => row.date.getTime() >= from.getTime())
}

/** Sums one numeric field across each bucket. */
export function sumBuckets<T extends Dated>(
  rows: readonly T[],
  grain: Grain,
  pick: (row: T) => number,
): { label: string; start: Date; value: number }[] {
  return bucketBy(rows, grain).map((bucket) => ({
    label: bucket.label,
    start: bucket.start,
    value: bucket.rows.reduce((total, row) => total + pick(row), 0),
  }))
}
