import { num, safeDiv, sumBy } from './core'
import type { CostLine, EacMethod, EacResult, EarnedValue } from './types'

/**
 * Earned-value position — Progress & Forecast ▸ C5:C10.
 *
 *   BAC = Σ current budget
 *   PV  = BAC × planned cumulative % at the data date
 *   EV  = Σ (current budget × % complete)
 *   AC  = Σ total cost to date
 *   CPI = EV ÷ AC
 *   SPI = EV ÷ PV
 */
export function computeEarnedValue(
  lines: readonly CostLine[],
  plannedCumPctAtDataDate: number,
): EarnedValue {
  const budgetAtCompletion = sumBy(lines, (l) => l.currentBudget)
  const earnedValue = sumBy(lines, (l) => l.earnedValue)
  const actualCost = sumBy(lines, (l) => l.totalCostToDate)
  const plannedValue = budgetAtCompletion * num(plannedCumPctAtDataDate)

  return {
    budgetAtCompletion,
    plannedValue,
    earnedValue,
    actualCost,
    costPerformanceIndex: safeDiv(earnedValue, actualCost),
    schedulePerformanceIndex: safeDiv(earnedValue, plannedValue),
    costVariance: earnedValue - actualCost,
    scheduleVariance: earnedValue - plannedValue,
  }
}

/**
 * Estimate at completion — Progress & Forecast ▸ F5:F9.
 *
 *   1  Bottom-up   = Σ line forecast at completion (the managers' numbers)
 *   2  Performance = BAC ÷ CPI                     (assumes present efficiency holds)
 *   3  Budget rate = AC + BAC − EV                 (assumes remaining work runs at budget)
 *
 * Method 2 degrades to BAC when CPI is 0, matching the sheet's IFERROR.
 */
export function computeEac(
  lines: readonly CostLine[],
  ev: EarnedValue,
  method: EacMethod,
): EacResult {
  const bottomUp = sumBy(lines, (l) => l.forecastAtCompletion)
  const cpiBased =
    ev.costPerformanceIndex === 0
      ? ev.budgetAtCompletion
      : safeDiv(ev.budgetAtCompletion, ev.costPerformanceIndex, ev.budgetAtCompletion)
  const budgetRate = ev.actualCost + ev.budgetAtCompletion - ev.earnedValue

  const selected =
    method === 'BOTTOM_UP' ? bottomUp : method === 'CPI_BASED' ? cpiBased : budgetRate

  return {
    bottomUp,
    cpiBased,
    budgetRate,
    selected,
    method,
    estimateToComplete: Math.max(0, selected - ev.actualCost),
    varianceAtCompletion: ev.budgetAtCompletion - selected,
  }
}

export interface ForecastComparisonRow {
  costCodeId: string
  code: string
  description: string
  currentBudget: number
  costToDate: number
  committed: number
  previousEac: number
  currentEac: number
  delta: number
  deltaPct: number
  pctComplete: number
  riskLevel: string
  note: string | null
}

/** Month-over-month forecast movement, the heart of the monthly reforecast review. */
export function compareForecast(
  current: readonly {
    costCodeId: string
    code: string
    description: string
    currentBudget: number
    costToDate: number
    committed: number
    estimateAtCompletion: number
    pctComplete: number
    riskLevel: string
    note: string | null
  }[],
  previousByCode: ReadonlyMap<string, number>,
): ForecastComparisonRow[] {
  return current.map((row) => {
    const previousEac = previousByCode.get(row.costCodeId) ?? 0
    const delta = row.estimateAtCompletion - previousEac
    return {
      costCodeId: row.costCodeId,
      code: row.code,
      description: row.description,
      currentBudget: row.currentBudget,
      costToDate: row.costToDate,
      committed: row.committed,
      previousEac,
      currentEac: row.estimateAtCompletion,
      delta: previousEac === 0 ? 0 : delta,
      deltaPct: safeDiv(delta, previousEac),
      pctComplete: row.pctComplete,
      riskLevel: row.riskLevel,
      note: row.note,
    }
  })
}
