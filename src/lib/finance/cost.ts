import { num, safeDiv, clampPct, sumBy } from './core'
import type { CategoryRollup, CostCategory, CostLine, CostLineInput } from './types'

export const COST_CATEGORIES: CostCategory[] = [
  'LABOR',
  'MATERIAL',
  'EQUIPMENT',
  'SUBCONTRACT',
  'GENERAL_CONDITIONS',
  'OVERHEAD',
  'CONTINGENCY',
  'OTHER',
]

export const CATEGORY_LABELS: Record<CostCategory, string> = {
  LABOR: 'Labor',
  MATERIAL: 'Material',
  EQUIPMENT: 'Equipment',
  SUBCONTRACT: 'Subcontract',
  GENERAL_CONDITIONS: 'General Conditions',
  OVERHEAD: 'Overhead',
  CONTINGENCY: 'Contingency',
  OTHER: 'Other',
}

/**
 * Derives one cost-control row.
 *
 * Workbook source: Project Controls ▸ Financials, columns G–S.
 *   G  Current Budget          = Original + Approved CO Budget
 *   K  Total Cost to Date      = Cost to Date + Accruals
 *   L  % Spent                 = Total Cost to Date ÷ Current Budget
 *   N  Earned Value            = Current Budget × % Complete
 *   O  Cost Variance           = Earned Value − Total Cost to Date
 *   P  Remaining Budget        = Current Budget − Total Cost to Date
 *   Q  Forecast to Complete    = IF(%C ≥ 1, 0, Current Budget × (1 − %C))
 *   R  Forecast at Completion  = Total Cost to Date + Forecast to Complete
 *   S  FAC Variance            = Current Budget − Forecast at Completion
 *
 * Two deliberate improvements over the spreadsheet:
 *   • `etcOverride` lets a manager forecast remaining cost directly instead of
 *     being forced through the budget × remaining-% formula.
 *   • When % complete is not entered we fall back to % spent rather than
 *     treating the line as 0% complete, which the sheet did implicitly.
 */
export function deriveCostLine(input: CostLineInput): CostLine {
  const currentBudget = num(input.originalBudget) + num(input.budgetRevisions)
  const costToDate = num(input.costToDate)
  const accruals = num(input.accruals)
  const totalCostToDate = costToDate + accruals
  const committed = num(input.committed)

  const pctSpent = safeDiv(totalCostToDate, currentBudget)
  const effectivePctComplete =
    input.pctComplete == null ? clampPct(pctSpent) : clampPct(input.pctComplete)

  const earnedValue = currentBudget * effectivePctComplete
  const costVariance = earnedValue - totalCostToDate
  const remainingBudget = currentBudget - totalCostToDate
  const remainingCommitment = Math.max(0, committed - costToDate)

  const forecastToComplete =
    input.etcOverride != null
      ? Math.max(0, num(input.etcOverride))
      : effectivePctComplete >= 1
        ? 0
        : currentBudget * (1 - effectivePctComplete)

  const forecastAtCompletion = totalCostToDate + forecastToComplete
  const facVariance = currentBudget - forecastAtCompletion

  return {
    ...input,
    currentBudget,
    totalCostToDate,
    pctSpent,
    effectivePctComplete,
    earnedValue,
    costVariance,
    remainingBudget,
    remainingCommitment,
    forecastToComplete,
    forecastAtCompletion,
    facVariance,
    overBudget: facVariance < -0.005,
  }
}

export function deriveCostLines(inputs: readonly CostLineInput[]): CostLine[] {
  return inputs.map(deriveCostLine)
}

/**
 * Category summary — Financials ▸ V6:AA14.
 * Categories with no budget, cost or forecast are dropped so the summary panel
 * and its chart never render empty rows.
 */
export function rollupByCategory(lines: readonly CostLine[]): CategoryRollup[] {
  return COST_CATEGORIES.map((category) => {
    const rows = lines.filter((l) => l.category === category)
    const currentBudget = sumBy(rows, (r) => r.currentBudget)
    const costToDate = sumBy(rows, (r) => r.totalCostToDate)
    const committed = sumBy(rows, (r) => r.committed)
    const forecastAtCompletion = sumBy(rows, (r) => r.forecastAtCompletion)
    return {
      category,
      currentBudget,
      costToDate,
      committed,
      forecastAtCompletion,
      facVariance: currentBudget - forecastAtCompletion,
    }
  }).filter((r) => r.currentBudget !== 0 || r.costToDate !== 0 || r.forecastAtCompletion !== 0)
}

export interface GroupRollup {
  key: string
  label: string
  currentBudget: number
  costToDate: number
  committed: number
  forecastAtCompletion: number
  facVariance: number
  pctComplete: number
  lineCount: number
}

/** Generic drill-down grouping used by the trade / division / vendor views. */
export function rollupBy(
  lines: readonly CostLine[],
  keyOf: (line: CostLine) => { key: string; label: string },
): GroupRollup[] {
  const map = new Map<string, GroupRollup>()
  for (const line of lines) {
    const { key, label } = keyOf(line)
    const existing = map.get(key) ?? {
      key,
      label,
      currentBudget: 0,
      costToDate: 0,
      committed: 0,
      forecastAtCompletion: 0,
      facVariance: 0,
      pctComplete: 0,
      lineCount: 0,
    }
    existing.currentBudget += line.currentBudget
    existing.costToDate += line.totalCostToDate
    existing.committed += line.committed
    existing.forecastAtCompletion += line.forecastAtCompletion
    existing.lineCount += 1
    map.set(key, existing)
  }
  return [...map.values()]
    .map((g) => ({
      ...g,
      facVariance: g.currentBudget - g.forecastAtCompletion,
      pctComplete: safeDiv(g.costToDate, g.forecastAtCompletion || g.currentBudget),
    }))
    .sort((a, b) => b.currentBudget - a.currentBudget)
}
