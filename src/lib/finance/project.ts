import { num, safeDiv, sumBy } from './core'
import { daysBetween } from './dates'
import {
  computeBillingPosition,
  computeRevenuePosition,
  type BillingInput,
  type SovLineInput,
} from './billing'
import { computeContractPosition, type ChangeOrderDerived } from './changeOrders'
import { deriveCostLines, rollupByCategory } from './cost'
import { computeEac, computeEarnedValue } from './forecast'
import { rollupCommitments, type CommitmentDerived } from './commitments'
import type {
  CostLineInput,
  EacMethod,
  PocMethod,
  ProjectFinancials,
  ProjectHealth,
} from './types'

export interface ProjectFinancialsInput {
  projectId: string
  dataDate: Date
  contractCompletion: Date | null
  forecastCompletion: Date | null
  originalContractSum: number
  ownerRetentionPct: number
  targetMarginPct: number
  eacMethod: EacMethod
  pocMethod: PocMethod
  manualPctComplete: number | null
  pendingCoInclusionPct: number
  plannedCumPctAtDataDate: number
  safetyScore: number | null
  qualityScore: number | null
  costLines: CostLineInput[]
  changeOrders: ChangeOrderDerived[]
  commitments: CommitmentDerived[]
  billings: BillingInput[]
  sovLines: SovLineInput[]
  /** Physical progress from quantity tracking, 0–1, when available. */
  quantityPctComplete: number | null
  /** Weighted average subcontract progress, 0–1. */
  subcontractorPctComplete: number | null
  /** Schedule-based progress, 0–1. */
  schedulePctComplete: number | null
}

/**
 * Assembles the complete financial picture of one project.
 *
 * This is the single place every project number is produced. Dashboards, reports,
 * exports and the company rollup all read from this result rather than
 * recomputing, so a figure can never disagree with itself across two screens.
 */
export function computeProjectFinancials(input: ProjectFinancialsInput): ProjectFinancials {
  const contract = computeContractPosition(
    input.originalContractSum,
    input.changeOrders,
    input.pendingCoInclusionPct,
  )

  const lines = deriveCostLines(input.costLines)
  const categories = rollupByCategory(lines)

  const originalBudget = sumBy(lines, (l) => l.originalBudget)
  const currentBudget = sumBy(lines, (l) => l.currentBudget)
  const costToDate = sumBy(lines, (l) => l.costToDate)
  const accruals = sumBy(lines, (l) => l.accruals)
  const totalCostToDate = costToDate + accruals
  const committed = sumBy(lines, (l) => l.committed)
  const remainingCommitment = sumBy(lines, (l) => l.remainingCommitment)
  const remainingBudget = currentBudget - totalCostToDate

  const earnedValue = computeEarnedValue(lines, input.plannedCumPctAtDataDate)
  const eac = computeEac(lines, earnedValue, input.eacMethod)

  const forecastCost = eac.selected
  const forecastProfit = contract.forecastContract - forecastCost
  const forecastMargin = safeDiv(forecastProfit, contract.forecastContract)

  const billing = computeBillingPosition(
    input.billings,
    input.sovLines,
    contract.originalContract,
    contract.approvedChangeOrders,
    input.dataDate,
  )

  const revenue = computeRevenuePosition({
    method: input.pocMethod,
    costToDate: totalCostToDate,
    forecastCost,
    quantityPctComplete: input.quantityPctComplete,
    subcontractorPctComplete: input.subcontractorPctComplete,
    schedulePctComplete: input.schedulePctComplete,
    manualPctComplete: input.manualPctComplete,
    earnedValue: earnedValue.earnedValue,
    budgetAtCompletion: earnedValue.budgetAtCompletion,
    amountBilled: billing.totalCompletedAndStored,
    contractValue: contract.currentContract,
  })

  const subcontractRows = input.commitments.filter((c) => c.type === 'SUBCONTRACT')
  const poRows = input.commitments.filter((c) => c.type !== 'SUBCONTRACT')
  const subcontracts = rollupCommitments(subcontractRows)
  const purchaseOrders = rollupCommitments(poRows)

  const health = computeHealth({
    contractCompletion: input.contractCompletion,
    forecastCompletion: input.forecastCompletion,
    forecastMargin,
    targetMarginPct: input.targetMarginPct,
    accountsReceivable: billing.accountsReceivable,
    currentContract: contract.currentContract,
    safetyScore: input.safetyScore,
    qualityScore: input.qualityScore,
  })

  return {
    projectId: input.projectId,
    dataDate: input.dataDate,
    contract,
    lines,
    categories,
    originalBudget,
    currentBudget,
    costToDate,
    accruals,
    totalCostToDate,
    committed,
    remainingCommitment,
    remainingBudget,
    earnedValue,
    eac,
    forecastCost,
    forecastProfit,
    forecastMargin,
    marginVsTarget: forecastMargin - num(input.targetMarginPct),
    costVariance: earnedValue.costVariance,
    billing,
    revenue,
    subcontracts,
    purchaseOrders,
    retentionReceivable: billing.retainageHeld,
    retentionPayable: subcontracts.retentionHeld + purchaseOrders.retentionHeld,
    accountsPayable: subcontracts.outstanding + purchaseOrders.outstanding,
    backlog: contract.currentContract - billing.totalCompletedAndStored,
    health,
  }
}

/**
 * Risk scoring: Project Summary ▸ W,X,Y,Z.
 *   Behind schedule            +2   (and a further +1 past 14 days)
 *   Margin under target        +2   (and +3 more if the project is losing money)
 *   AR over 25% of contract    +1
 *   Safety or quality below 4  +1 each
 *   ≥5 → HIGH RISK · ≥3 → WATCH · otherwise OK
 */
export function computeHealth(input: {
  contractCompletion: Date | null
  forecastCompletion: Date | null
  forecastMargin: number
  targetMarginPct: number
  accountsReceivable: number
  currentContract: number
  safetyScore: number | null
  qualityScore: number | null
}): ProjectHealth {
  const daysAheadBehind =
    input.contractCompletion && input.forecastCompletion
      ? daysBetween(input.forecastCompletion, input.contractCompletion)
      : null

  let score = 0
  if (daysAheadBehind != null) {
    if (daysAheadBehind < 0) score += 2
    if (daysAheadBehind < -14) score += 1
  }
  if (input.forecastMargin < num(input.targetMarginPct)) score += 2
  if (input.forecastMargin < 0) score += 3
  if (num(input.accountsReceivable) > 0.25 * num(input.currentContract)) score += 1
  if (input.safetyScore != null && input.safetyScore < 4) score += 1
  if (input.qualityScore != null && input.qualityScore < 4) score += 1

  const scheduleStatus: ProjectHealth['scheduleStatus'] =
    daysAheadBehind == null
      ? 'Unknown'
      : daysAheadBehind >= 0
        ? 'On / Ahead'
        : daysAheadBehind >= -14
          ? 'Behind'
          : 'Critical'

  const budgetHealth: ProjectHealth['budgetHealth'] =
    input.forecastMargin < 0
      ? 'LOSS'
      : input.forecastMargin < num(input.targetMarginPct)
        ? 'Thin Margin'
        : 'Healthy'

  return {
    score,
    flag: score >= 5 ? 'HIGH RISK' : score >= 3 ? 'WATCH' : 'OK',
    scheduleStatus,
    budgetHealth,
    daysAheadBehind,
  }
}

export interface QuantityProgress {
  itemId: string
  description: string
  uom: string
  costCode: string | null
  budgetQty: number
  installedToDate: number
  pctInstalled: number
  remainingQty: number
  budgetUnitRate: number
  budgetHours: number
  earnedHours: number
  actualHours: number
  hoursVariance: number
  actualUnitRate: number
  productivityFactor: number
  forecastHoursAtCompletion: number
  forecastHoursVariance: number
  crewDays: number
  avgDailyProduction: number
  daysToComplete: number
  materialOrderedQty: number
  materialOveragePct: number
}

/**
 * Quantity Tracking ▸ H–AB.
 *   Productivity Factor = Earned Hours ÷ Actual Hours   (>1 means beating budget)
 *   Forecast Hours      = Budget Hours ÷ Productivity Factor
 *   Actual Unit Rate    = Actual Hours ÷ Installed to Date
 *   Days to Complete    = ROUNDUP(Remaining ÷ Avg Daily Production)
 */
export function deriveQuantityProgress(item: {
  itemId: string
  description: string
  uom: string
  costCode: string | null
  budgetQty: number
  budgetUnitRate: number
  materialOrderedQty: number
  entries: { installedQty: number; actualHours: number; crewDays: number }[]
}): QuantityProgress {
  const installedToDate = sumBy(item.entries, (e) => e.installedQty)
  const actualHours = sumBy(item.entries, (e) => e.actualHours)
  const crewDays = sumBy(item.entries, (e) => e.crewDays)

  const budgetHours = num(item.budgetQty) * num(item.budgetUnitRate)
  const earnedHours = installedToDate * num(item.budgetUnitRate)
  const productivityFactor = safeDiv(earnedHours, actualHours)
  const remainingQty = num(item.budgetQty) - installedToDate
  const avgDailyProduction = safeDiv(installedToDate, crewDays)

  return {
    itemId: item.itemId,
    description: item.description,
    uom: item.uom,
    costCode: item.costCode,
    budgetQty: num(item.budgetQty),
    installedToDate,
    pctInstalled: safeDiv(installedToDate, num(item.budgetQty)),
    remainingQty,
    budgetUnitRate: num(item.budgetUnitRate),
    budgetHours,
    earnedHours,
    actualHours,
    hoursVariance: earnedHours - actualHours,
    actualUnitRate: safeDiv(actualHours, installedToDate),
    productivityFactor,
    forecastHoursAtCompletion: productivityFactor === 0 ? budgetHours : safeDiv(budgetHours, productivityFactor, budgetHours),
    forecastHoursVariance:
      budgetHours - (productivityFactor === 0 ? budgetHours : safeDiv(budgetHours, productivityFactor, budgetHours)),
    crewDays,
    avgDailyProduction,
    daysToComplete: avgDailyProduction > 0 && remainingQty > 0 ? Math.ceil(remainingQty / avgDailyProduction) : 0,
    materialOrderedQty: num(item.materialOrderedQty),
    materialOveragePct: safeDiv(num(item.materialOrderedQty) - num(item.budgetQty), num(item.budgetQty)),
  }
}

/** Quantity-weighted overall physical progress, used by the QUANTITY POC method. */
export function overallQuantityProgress(rows: readonly QuantityProgress[]): number | null {
  const totalBudgetHours = sumBy(rows, (r) => r.budgetHours)
  if (totalBudgetHours === 0) return null
  return safeDiv(sumBy(rows, (r) => r.earnedHours), totalBudgetHours)
}
