import { describe, expect, it } from 'vitest'
import { sheetToPdfSection, sheetsToPdf } from './pdf-report'
import type { SheetSpec } from './excel'

/**
 * The Excel and PDF exports render from one sheet spec. These tests hold that
 * bridge honest: the same numbers, formatted the same way the screen formats
 * them, with totals that agree with the workbook's.
 */

const spec: SheetSpec = {
  name: 'Work in progress',
  notes: ['Work-in-progress schedule, Demo Co', 'Generated 2026-08-03 · 3 projects in view'],
  totalsRow: true,
  columns: [
    { header: 'Job', key: 'number', width: 12 },
    { header: 'Contract value', key: 'contract', format: 'money', total: true },
    { header: '% complete', key: 'pct', format: 'percent' },
    { header: 'Started', key: 'started', format: 'date' },
    { header: 'Lines', key: 'lines', format: 'number', total: true },
  ],
  rows: [
    { number: '26-001', contract: 2_518_000, pct: 0.3623, started: new Date('2025-09-01T00:00:00Z'), lines: 42 },
    { number: '26-002', contract: -14_500, pct: 0, started: null, lines: 3 },
    { number: '26-003', contract: 0, pct: 1, started: new Date('2026-01-15T00:00:00Z'), lines: 0 },
  ],
}

describe('sheet to PDF', () => {
  const section = sheetToPdfSection(spec)

  it('formats money the accounting way, with negatives in parentheses', () => {
    expect(section.table!.rows[0].contract).toBe('$2,518,000')
    expect(section.table!.rows[1].contract).toBe('($14,500)')
  })

  it('renders a zero money value as a dash, matching the workbook and the screen', () => {
    expect(section.table!.rows[2].contract).toBe('-')
  })

  it('formats percentages and dates', () => {
    expect(section.table!.rows[0].pct).toBe('36.2%')
    expect(section.table!.rows[0].started).toBe('Sep 1, 2025')
    expect(section.table!.rows[1].started).toBe('-')
  })

  it('totals only the columns the workbook totals, and counts the rows', () => {
    const totals = section.table!.totals!
    expect(totals.number).toBe('Total (3)')
    expect(totals.contract).toBe('$2,503,500') // 2,518,000 − 14,500 + 0
    expect(totals.lines).toBe('45')
    expect(totals.pct).toBeUndefined() // a percentage is not summable
  })

  it('right-aligns numeric columns and left-aligns text', () => {
    const byKey = Object.fromEntries(section.table!.columns.map((c) => [c.key, c.align]))
    expect(byKey.number).toBe('left')
    expect(byKey.contract).toBe('right')
    expect(byKey.pct).toBe('right')
    expect(byKey.lines).toBe('right')
    expect(byKey.started).toBe('left')
  })

  it('scales column widths to the printable page rather than leaving Excel units', () => {
    const total = section.table!.columns.reduce((a, c) => a + c.width, 0)
    expect(total).toBeGreaterThan(600)
    expect(total).toBeLessThanOrEqual(760)
  })

  it('drops the repeated heading on a single-sheet export but keeps it when there are several', () => {
    const single = sheetsToPdf([spec], { title: 'WIP', company: 'Demo Co' })
    expect(single.sections[0].heading).toBeUndefined()

    const many = sheetsToPdf([spec, { ...spec, name: 'By manager' }], { title: 'Profitability', company: 'Demo Co' })
    expect(many.sections.map((s) => s.heading)).toEqual(['Work in progress', 'By manager'])
  })

  it('omits the totals row when the sheet has none, and when it has no rows', () => {
    expect(sheetToPdfSection({ ...spec, totalsRow: false }).table!.totals).toBeUndefined()
    expect(sheetToPdfSection({ ...spec, rows: [] }).table!.totals).toBeUndefined()
  })
})
