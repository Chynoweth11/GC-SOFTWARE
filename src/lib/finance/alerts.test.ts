import { describe, expect, it } from 'vitest'
import { sortAlerts } from './alerts'
import type { Alert } from './types'

/**
 * The order alerts arrive in.
 *
 * The building of them is checked against live data by `verify:figures`; what
 * was never checked is the order, and the order is the whole point of a panel
 * somebody glances at. A critical loss listed under three informational notes
 * is a critical loss nobody read.
 */

const alert = (over: Partial<Alert> = {}): Alert => ({
  id: 'a',
  severity: 'INFO',
  category: 'cost',
  title: 'Something',
  detail: 'A detail',
  projectId: 'p1',
  projectNumber: '26-001',
  projectName: 'Cascade Ridge',
  ...over,
})

describe('alerts: what is read first', () => {
  it('puts critical above warning, and warning above information', () => {
    const sorted = sortAlerts([
      alert({ severity: 'INFO', title: 'Note' }),
      alert({ severity: 'CRITICAL', title: 'Loss' }),
      alert({ severity: 'WARNING', title: 'Thin' }),
    ])
    expect(sorted.map((entry) => entry.severity)).toEqual(['CRITICAL', 'WARNING', 'INFO'])
  })

  it('leads with the largest amount inside one severity', () => {
    const sorted = sortAlerts([
      alert({ severity: 'WARNING', title: 'Small', value: 5_000 }),
      alert({ severity: 'WARNING', title: 'Large', value: 250_000 }),
      alert({ severity: 'WARNING', title: 'Middling', value: 40_000 }),
    ])
    expect(sorted.map((entry) => entry.title)).toEqual(['Large', 'Middling', 'Small'])
  })

  it('ranks a large overrun and a large underrun equally, because both are wrong', () => {
    // A job 200,000 under budget is as much a forecasting failure as one
    // 200,000 over, and burying it under a smaller overrun would hide it.
    const sorted = sortAlerts([
      alert({ severity: 'WARNING', title: 'Over', value: 120_000 }),
      alert({ severity: 'WARNING', title: 'Under', value: -200_000 }),
    ])
    expect(sorted[0].title).toBe('Under')
  })

  it('falls back to the title so the order never wobbles between reads', () => {
    const sorted = sortAlerts([
      alert({ severity: 'INFO', title: 'Beta' }),
      alert({ severity: 'INFO', title: 'Alpha' }),
    ])
    expect(sorted.map((entry) => entry.title)).toEqual(['Alpha', 'Beta'])
  })

  it('treats an alert with no amount as the smallest, not as an error', () => {
    const sorted = sortAlerts([
      alert({ severity: 'WARNING', title: 'No figure' }),
      alert({ severity: 'WARNING', title: 'Has one', value: 1 }),
    ])
    expect(sorted[0].title).toBe('Has one')
  })

  it('does not disturb the list it was given', () => {
    const original = [alert({ severity: 'INFO', title: 'B' }), alert({ severity: 'CRITICAL', title: 'A' })]
    const before = original.map((entry) => entry.title)
    sortAlerts(original)
    expect(original.map((entry) => entry.title)).toEqual(before)
  })

  it('sorts nothing without complaint', () => {
    expect(sortAlerts([])).toEqual([])
  })
})
