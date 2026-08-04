import { describe, expect, it } from 'vitest'
import { deriveCostLines } from './cost'
import { computeEac, computeEarnedValue } from './forecast'
import type { CostLineInput } from './types'

/**
 * Reproduces the full Financials tab of job 26-001 so the earned-value and EAC
 * panel can be checked against Progress & Forecast ▸ C5:C10 and F5:F9.
 */
const WORKBOOK_LINES: CostLineInput[] = [
  { costCodeId: '1', code: '01-000', description: 'General conditions & supervision', category: 'GENERAL_CONDITIONS', originalBudget: 186_000, budgetRevisions: 0, committed: 186_000, costToDate: 62_400, accruals: 4_200, pctComplete: 0.34 },
  { costCodeId: '2', code: '02-500', description: 'Site utilities subcontract', category: 'SUBCONTRACT', originalBudget: 286_000, budgetRevisions: 6_500, committed: 292_500, costToDate: 181_350, accruals: 0, pctComplete: 0.62 },
  { costCodeId: '3', code: '03-100', description: 'Foundations subcontract', category: 'SUBCONTRACT', originalBudget: 252_000, budgetRevisions: 0, committed: 252_000, costToDate: 252_000, accruals: 0, pctComplete: 1 },
  { costCodeId: '4', code: '06-100', description: 'Framing labor', category: 'LABOR', originalBudget: 214_000, budgetRevisions: 12_000, committed: 0, costToDate: 138_600, accruals: 8_400, pctComplete: 0.6 },
  { costCodeId: '5', code: '06-105', description: 'Framing material', category: 'MATERIAL', originalBudget: 116_000, budgetRevisions: 6_000, committed: 122_000, costToDate: 96_800, accruals: 0, pctComplete: 0.78 },
  { costCodeId: '6', code: '06-110', description: 'Crane & lift equipment', category: 'EQUIPMENT', originalBudget: 28_000, budgetRevisions: 0, committed: 21_000, costToDate: 16_800, accruals: 0, pctComplete: 0.6 },
  { costCodeId: '7', code: '07-400', description: 'Roofing subcontract', category: 'SUBCONTRACT', originalBudget: 78_000, budgetRevisions: 0, committed: 78_000, costToDate: 19_500, accruals: 0, pctComplete: 0.25 },
  { costCodeId: '8', code: '15-000', description: 'HVAC subcontract', category: 'SUBCONTRACT', originalBudget: 122_000, budgetRevisions: 0, committed: 122_000, costToDate: 36_600, accruals: 0, pctComplete: 0.3 },
  { costCodeId: '9', code: '16-000', description: 'Electrical subcontract', category: 'SUBCONTRACT', originalBudget: 148_000, budgetRevisions: 4_200, committed: 152_200, costToDate: 48_704, accruals: 0, pctComplete: 0.32 },
  { costCodeId: '10', code: '12-000', description: 'Millwork subcontract', category: 'SUBCONTRACT', originalBudget: 132_000, budgetRevisions: 0, committed: 132_000, costToDate: 13_200, accruals: 0, pctComplete: 0.1 },
  { costCodeId: '11', code: '99-000', description: 'Overhead allocation', category: 'OVERHEAD', originalBudget: 147_000, budgetRevisions: 0, committed: 0, costToDate: 49_300, accruals: 0, pctComplete: 0.34 },
  { costCodeId: '12', code: '98-000', description: 'Project contingency', category: 'CONTINGENCY', originalBudget: 62_000, budgetRevisions: 0, committed: 0, costToDate: 0, accruals: 0, pctComplete: 0 },
]

const lines = deriveCostLines(WORKBOOK_LINES)

describe('earned value: Progress & Forecast C5:C10', () => {
  // Planned cumulative % at the 31 Mar 2026 data date was 40%.
  const ev = computeEarnedValue(lines, 0.4)

  it('budget at completion equals the workbook BAC', () => {
    expect(ev.budgetAtCompletion).toBeCloseTo(1_799_700, 4)
  })

  it('actual cost equals the workbook AC', () => {
    expect(ev.actualCost).toBeCloseTo(927_854, 4)
  })

  it('earned value equals the workbook EV', () => {
    expect(ev.earnedValue).toBeCloseTo(912_134, 4)
  })

  it('planned value equals BAC × planned cumulative %', () => {
    expect(ev.plannedValue).toBeCloseTo(719_880, 4)
  })

  it('CPI and SPI match the workbook', () => {
    expect(ev.costPerformanceIndex).toBeCloseTo(0.983057679333171, 10)
    expect(ev.schedulePerformanceIndex).toBeCloseTo(1.26706395510363, 10)
  })

  it('variances are internally consistent', () => {
    expect(ev.costVariance).toBeCloseTo(ev.earnedValue - ev.actualCost, 6)
    expect(ev.scheduleVariance).toBeCloseTo(ev.earnedValue - ev.plannedValue, 6)
  })
})

describe('estimate at completion: Progress & Forecast F5:F9', () => {
  const ev = computeEarnedValue(lines, 0.4)

  it('method 1, bottom-up, equals the sum of the line forecasts', () => {
    expect(computeEac(lines, ev, 'BOTTOM_UP').bottomUp).toBeCloseTo(1_815_420, 4)
  })

  it('method 2, BAC ÷ CPI, matches the workbook', () => {
    expect(computeEac(lines, ev, 'CPI_BASED').cpiBased).toBeCloseTo(1_830_716.58747509, 6)
  })

  it('method 3, AC + BAC − EV, matches the workbook', () => {
    expect(computeEac(lines, ev, 'BUDGET_RATE').budgetRate).toBeCloseTo(1_815_420, 4)
  })

  it('the selected method drives ETC and VAC', () => {
    const eac = computeEac(lines, ev, 'BOTTOM_UP')
    expect(eac.selected).toBeCloseTo(1_815_420, 4)
    expect(eac.estimateToComplete).toBeCloseTo(887_566, 4)
    expect(eac.varianceAtCompletion).toBeCloseTo(-15_720, 4)
  })

  it('switching the method changes the answer, not the inputs', () => {
    const a = computeEac(lines, ev, 'BOTTOM_UP')
    const b = computeEac(lines, ev, 'CPI_BASED')
    expect(a.bottomUp).toBe(b.bottomUp)
    expect(a.selected).not.toBeCloseTo(b.selected, 2)
  })

  it('a zero CPI degrades to BAC rather than dividing by zero', () => {
    const zeroEv = { ...ev, earnedValue: 0, costPerformanceIndex: 0 }
    const eac = computeEac(lines, zeroEv, 'CPI_BASED')
    expect(eac.cpiBased).toBe(zeroEv.budgetAtCompletion)
    expect(Number.isFinite(eac.selected)).toBe(true)
  })

  it('estimate to complete never goes negative', () => {
    const overspent = { ...ev, actualCost: 5_000_000 }
    expect(computeEac(lines, overspent, 'BOTTOM_UP').estimateToComplete).toBe(0)
  })
})
