import { describe, expect, it } from 'vitest'
import {
  bucketBy,
  bucketLabel,
  rangeStart,
  startOfQuarter,
  startOfWeek,
  sumBuckets,
  withinRange,
} from './periods'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

describe('period grouping', () => {
  it('starts a week on Monday, whatever day the date is', () => {
    expect(startOfWeek(d('2026-03-18')).toISOString().slice(0, 10)).toBe('2026-03-16') // a Wednesday
    expect(startOfWeek(d('2026-03-16')).toISOString().slice(0, 10)).toBe('2026-03-16') // already Monday
    expect(startOfWeek(d('2026-03-22')).toISOString().slice(0, 10)).toBe('2026-03-16') // Sunday belongs to the week before
  })

  it('groups quarters on the calendar, not on a rolling window', () => {
    expect(startOfQuarter(d('2026-02-14')).toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(startOfQuarter(d('2026-04-01')).toISOString().slice(0, 10)).toBe('2026-04-01')
    expect(startOfQuarter(d('2026-12-31')).toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  it('includes empty periods so a gap in trading is visible', () => {
    const rows = [{ date: d('2026-01-05'), amount: 100 }, { date: d('2026-04-02'), amount: 250 }]
    const months = bucketBy(rows, 'month')
    expect(months).toHaveLength(4) // January through April
    expect(months.map((b) => b.rows.length)).toEqual([1, 0, 0, 1])
  })

  it('totals each bucket', () => {
    const rows = [
      { date: d('2026-01-05'), amount: 100 },
      { date: d('2026-01-27'), amount: 50 },
      { date: d('2026-02-03'), amount: 25 },
    ]
    expect(sumBuckets(rows, 'month', (r) => r.amount).map((b) => b.value)).toEqual([150, 25])
  })

  it('puts a transaction in the right week even across a month boundary', () => {
    // 30 March 2026 is a Monday, so 1 April falls in the week beginning 30 March.
    const rows = [{ date: d('2026-03-30'), amount: 1 }, { date: d('2026-04-01'), amount: 2 }]
    const weeks = sumBuckets(rows, 'week', (r) => r.amount)
    expect(weeks).toHaveLength(1)
    expect(weeks[0].value).toBe(3)
  })

  it('measures a range back from the data date, not from today', () => {
    const asOf = d('2026-03-31')
    expect(rangeStart('3m', asOf)?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(rangeStart('12m', asOf)?.toISOString().slice(0, 10)).toBe('2025-04-01')
    expect(rangeStart('ytd', asOf)?.toISOString().slice(0, 10)).toBe('2026-01-01')
    expect(rangeStart('all', asOf)).toBeNull()
  })

  it('filters to the range inclusively', () => {
    const rows = [
      { date: d('2025-12-31'), amount: 1 },
      { date: d('2026-01-01'), amount: 2 },
      { date: d('2026-03-31'), amount: 3 },
    ]
    const kept = withinRange(rows, '3m', d('2026-03-31'))
    expect(kept.map((r) => r.amount)).toEqual([2, 3])
    expect(withinRange(rows, 'all', d('2026-03-31'))).toHaveLength(3)
  })

  it('labels each grain the way it would be read aloud', () => {
    expect(bucketLabel(d('2026-03-16'), 'week')).toBe('w/c Mar 16')
    expect(bucketLabel(d('2026-03-01'), 'month')).toBe('Mar 26')
    expect(bucketLabel(d('2026-07-01'), 'quarter')).toBe('Q3 2026')
    expect(bucketLabel(d('2026-01-01'), 'year')).toBe('2026')
  })

  it('returns nothing for no rows rather than inventing a period', () => {
    expect(bucketBy([], 'month')).toEqual([])
    expect(sumBuckets([], 'week', () => 0)).toEqual([])
  })
})
