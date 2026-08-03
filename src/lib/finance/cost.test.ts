import { describe, expect, it } from 'vitest'
import { deriveCostLine, deriveCostLines, rollupByCategory, rollupBy } from './cost'
import type { CostLineInput } from './types'

/**
 * Every expected value below is the number the source workbook produced for the
 * same inputs (Project Controls ▸ Financials, job 26-001). If a refactor changes
 * one of these, the software has stopped agreeing with the spreadsheet it replaced.
 */

const base = (over: Partial<CostLineInput> = {}): CostLineInput => ({
  costCodeId: 'cc',
  code: '00-000',
  description: 'test',
  category: 'SUBCONTRACT',
  originalBudget: 0,
  budgetRevisions: 0,
  committed: 0,
  costToDate: 0,
  accruals: 0,
  pctComplete: 0,
  ...over,
})

describe('deriveCostLine — matches the workbook row for row', () => {
  it('01-000 general conditions (row 7)', () => {
    const line = deriveCostLine(
      base({
        code: '01-000',
        category: 'GENERAL_CONDITIONS',
        originalBudget: 186_000,
        budgetRevisions: 0,
        committed: 186_000,
        costToDate: 62_400,
        accruals: 4_200,
        pctComplete: 0.34,
      }),
    )
    expect(line.currentBudget).toBe(186_000)
    expect(line.totalCostToDate).toBe(66_600)
    expect(line.pctSpent).toBeCloseTo(0.3580645161, 8)
    expect(line.earnedValue).toBeCloseTo(63_240, 6)
    expect(line.costVariance).toBeCloseTo(-3_360, 6)
    expect(line.remainingBudget).toBe(119_400)
    expect(line.forecastToComplete).toBeCloseTo(122_760, 6)
    expect(line.forecastAtCompletion).toBeCloseTo(189_360, 6)
    expect(line.facVariance).toBeCloseTo(-3_360, 6)
    expect(line.overBudget).toBe(true)
  })

  it('02-500 site utilities with a change-order budget (row 8)', () => {
    const line = deriveCostLine(
      base({
        code: '02-500',
        originalBudget: 286_000,
        budgetRevisions: 6_500,
        committed: 292_500,
        costToDate: 181_350,
        pctComplete: 0.62,
      }),
    )
    expect(line.currentBudget).toBe(292_500)
    expect(line.earnedValue).toBeCloseTo(181_350, 6)
    expect(line.costVariance).toBeCloseTo(0, 6)
    expect(line.forecastToComplete).toBeCloseTo(111_150, 6)
    expect(line.forecastAtCompletion).toBeCloseTo(292_500, 6)
    expect(line.facVariance).toBeCloseTo(0, 6)
    expect(line.overBudget).toBe(false)
  })

  it('03-100 complete line forecasts no further cost (row 9)', () => {
    const line = deriveCostLine(
      base({ originalBudget: 252_000, committed: 252_000, costToDate: 252_000, pctComplete: 1 }),
    )
    expect(line.forecastToComplete).toBe(0)
    expect(line.forecastAtCompletion).toBe(252_000)
    expect(line.facVariance).toBe(0)
  })

  it('06-100 self-perform framing running over (row 10)', () => {
    const line = deriveCostLine(
      base({
        category: 'LABOR',
        originalBudget: 214_000,
        budgetRevisions: 12_000,
        committed: 0,
        costToDate: 138_600,
        accruals: 8_400,
        pctComplete: 0.6,
      }),
    )
    expect(line.currentBudget).toBe(226_000)
    expect(line.totalCostToDate).toBe(147_000)
    expect(line.earnedValue).toBeCloseTo(135_600, 6)
    expect(line.costVariance).toBeCloseTo(-11_400, 6)
    expect(line.forecastAtCompletion).toBeCloseTo(237_400, 6)
    expect(line.facVariance).toBeCloseTo(-11_400, 6)
  })

  it('a zero budget never divides by zero', () => {
    const line = deriveCostLine(base({ originalBudget: 0, costToDate: 5_000, pctComplete: null }))
    expect(line.pctSpent).toBe(0)
    expect(Number.isFinite(line.forecastAtCompletion)).toBe(true)
  })

  it('falls back to percent spent when progress has not been entered', () => {
    const line = deriveCostLine(base({ originalBudget: 100_000, costToDate: 40_000, pctComplete: null }))
    expect(line.effectivePctComplete).toBeCloseTo(0.4, 10)
    expect(line.earnedValue).toBeCloseTo(40_000, 6)
    expect(line.costVariance).toBeCloseTo(0, 6)
  })

  it('honours a manager ETC override instead of the budget formula', () => {
    const line = deriveCostLine(
      base({ originalBudget: 100_000, costToDate: 40_000, pctComplete: 0.5, etcOverride: 75_000 }),
    )
    expect(line.forecastToComplete).toBe(75_000)
    expect(line.forecastAtCompletion).toBe(115_000)
    expect(line.facVariance).toBe(-15_000)
  })

  it('remaining commitment never goes negative when cost exceeds the commitment', () => {
    const line = deriveCostLine(base({ committed: 50_000, costToDate: 60_000 }))
    expect(line.remainingCommitment).toBe(0)
  })
})

describe('category rollup — Financials V6:AA14', () => {
  const lines = deriveCostLines([
    base({ code: '01-000', category: 'GENERAL_CONDITIONS', originalBudget: 186_000, committed: 186_000, costToDate: 62_400, accruals: 4_200, pctComplete: 0.34 }),
    base({ code: '06-100', category: 'LABOR', originalBudget: 214_000, budgetRevisions: 12_000, costToDate: 138_600, accruals: 8_400, pctComplete: 0.6 }),
    base({ code: '06-105', category: 'MATERIAL', originalBudget: 116_000, budgetRevisions: 6_000, committed: 122_000, costToDate: 96_800, pctComplete: 0.78 }),
    base({ code: '06-110', category: 'EQUIPMENT', originalBudget: 28_000, committed: 21_000, costToDate: 16_800, pctComplete: 0.6 }),
    base({ code: '02-500', category: 'SUBCONTRACT', originalBudget: 286_000, budgetRevisions: 6_500, committed: 292_500, costToDate: 181_350, pctComplete: 0.62 }),
  ])

  it('sums each category to the workbook totals', () => {
    const rollup = rollupByCategory(lines)
    const labor = rollup.find((r) => r.category === 'LABOR')!
    expect(labor.currentBudget).toBe(226_000)
    expect(labor.costToDate).toBe(147_000)
    expect(labor.committed).toBe(0)
    expect(labor.forecastAtCompletion).toBeCloseTo(237_400, 6)
    expect(labor.facVariance).toBeCloseTo(-11_400, 6)

    const material = rollup.find((r) => r.category === 'MATERIAL')!
    expect(material.currentBudget).toBe(122_000)
    expect(material.forecastAtCompletion).toBeCloseTo(123_640, 6)
    expect(material.facVariance).toBeCloseTo(-1_640, 6)
  })

  it('drops categories with nothing in them', () => {
    expect(rollupByCategory(lines).map((r) => r.category)).not.toContain('CONTINGENCY')
  })
})

describe('generic grouping', () => {
  it('groups by trade and sorts by budget descending', () => {
    const lines = deriveCostLines([
      base({ code: 'a', tradeName: 'Framing', originalBudget: 100 }),
      base({ code: 'b', tradeName: 'Framing', originalBudget: 200 }),
      base({ code: 'c', tradeName: 'Roofing', originalBudget: 500 }),
    ])
    const groups = rollupBy(lines, (l) => ({ key: l.tradeName ?? '', label: l.tradeName ?? '' }))
    expect(groups[0].label).toBe('Roofing')
    expect(groups[0].currentBudget).toBe(500)
    expect(groups[1].currentBudget).toBe(300)
    expect(groups[1].lineCount).toBe(2)
  })
})
