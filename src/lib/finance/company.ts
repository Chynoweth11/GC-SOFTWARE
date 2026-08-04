import { num, safeDiv, sumBy } from './core'
import type { ProjectFinancials } from './types'

export interface ProjectRow {
  id: string
  number: string
  name: string
  clientName: string | null
  clientId: string | null
  location: string | null
  projectType: string | null
  pmName: string | null
  pmUserId: string | null
  status: string
  contractStart: Date | null
  contractCompletion: Date | null
  forecastCompletion: Date | null
  financials: ProjectFinancials
}

export interface PortfolioTotals {
  projectCount: number
  activeCount: number

  originalContract: number
  approvedChangeOrders: number
  pendingChangeOrders: number
  currentContract: number
  potentialContract: number

  originalBudget: number
  currentBudget: number
  actualCost: number
  committedCost: number
  forecastCost: number
  remainingCost: number
  estimateAtCompletion: number
  estimateToComplete: number

  revenueEarned: number
  billedToDate: number
  cashCollected: number
  backlog: number
  forecastProfit: number
  grossMargin: number
  grossProfitToDate: number
  grossMarginToDate: number

  accountsReceivable: number
  accountsPayable: number
  retentionReceivable: number
  retentionPayable: number
  overbilled: number
  underbilled: number

  weightedPctComplete: number
  projectsAtHighRisk: number
  projectsOnWatch: number
  projectsBehindSchedule: number
  projectsBelowTargetMargin: number
  projectsLosingMoney: number
}

/**
 * Company rollup: Executive Dashboard ▸ C8:C27 and Financial Dashboard ▸ C5:C15.
 *
 * Every figure here is a straight aggregation of the per-project engine output,
 * so the executive view and the project view can never disagree.
 */
export function rollupPortfolio(rows: readonly ProjectRow[], targetMarginPct: number): PortfolioTotals {
  const f = rows.map((r) => r.financials)

  const currentContract = sumBy(f, (x) => x.contract.currentContract)
  const billedToDate = sumBy(f, (x) => x.billing.totalCompletedAndStored)
  const actualCost = sumBy(f, (x) => x.totalCostToDate)
  const forecastCost = sumBy(f, (x) => x.forecastCost)
  const forecastProfit = sumBy(f, (x) => x.forecastProfit)

  const weightedPctComplete = safeDiv(
    rows.reduce((acc, r) => acc + r.financials.contract.currentContract * r.financials.revenue.pctComplete, 0),
    currentContract,
  )

  return {
    projectCount: rows.length,
    activeCount: rows.filter((r) =>
      ['ACTIVE', 'UNDER_CONSTRUCTION', 'PRECONSTRUCTION', 'AWARDED'].includes(r.status),
    ).length,

    originalContract: sumBy(f, (x) => x.contract.originalContract),
    approvedChangeOrders: sumBy(f, (x) => x.contract.approvedChangeOrders),
    pendingChangeOrders: sumBy(f, (x) => x.contract.pendingChangeOrders),
    currentContract,
    potentialContract: sumBy(f, (x) => x.contract.potentialContract),

    originalBudget: sumBy(f, (x) => x.originalBudget),
    currentBudget: sumBy(f, (x) => x.currentBudget),
    actualCost,
    committedCost: sumBy(f, (x) => x.committed),
    forecastCost,
    remainingCost: sumBy(f, (x) => x.eac.estimateToComplete),
    estimateAtCompletion: forecastCost,
    estimateToComplete: sumBy(f, (x) => x.eac.estimateToComplete),

    revenueEarned: sumBy(f, (x) => x.revenue.revenueEarned),
    billedToDate,
    cashCollected: sumBy(f, (x) => x.billing.amountCollected),
    backlog: sumBy(f, (x) => x.backlog),
    forecastProfit,
    grossMargin: safeDiv(forecastProfit, currentContract),
    grossProfitToDate: billedToDate - actualCost,
    grossMarginToDate: safeDiv(billedToDate - actualCost, billedToDate),

    accountsReceivable: sumBy(f, (x) => x.billing.accountsReceivable),
    accountsPayable: sumBy(f, (x) => x.accountsPayable),
    retentionReceivable: sumBy(f, (x) => x.retentionReceivable),
    retentionPayable: sumBy(f, (x) => x.retentionPayable),
    overbilled: sumBy(f, (x) => x.revenue.overbilled),
    underbilled: sumBy(f, (x) => x.revenue.underbilled),

    weightedPctComplete,
    projectsAtHighRisk: f.filter((x) => x.health.flag === 'HIGH RISK').length,
    projectsOnWatch: f.filter((x) => x.health.flag === 'WATCH').length,
    projectsBehindSchedule: f.filter(
      (x) => x.health.scheduleStatus === 'Behind' || x.health.scheduleStatus === 'Critical',
    ).length,
    projectsBelowTargetMargin: f.filter((x) => x.forecastMargin < num(targetMarginPct)).length,
    projectsLosingMoney: f.filter((x) => x.forecastProfit < 0).length,
  }
}

export interface PipelineRow {
  id: string
  number: string
  name: string
  clientName: string | null
  status: string
  estimatedValue: number
  submittedAmount: number
  winProbability: number
  bidDue: Date | null
  nextFollowUp: Date | null
  decisionDate: Date | null
  estimator: string | null
  clientType: string
  leadSource: string | null
}

export type FollowUpState = 'OVERDUE' | 'TODAY' | 'THIS WEEK' | 'SCHEDULED' | 'SET ONE' | 'CLOSED'

const OPEN_BID_STATUSES = new Set([
  'LEAD',
  'QUALIFYING',
  'ESTIMATING',
  'SUBMITTED',
  'PENDING_DECISION',
  'ON_HOLD',
])
const CLOSED_BID_STATUSES = new Set(['WON', 'LOST', 'NO_BID', 'WITHDRAWN'])

/** Bid Pipeline ▸ T: the follow-up engine that drives the pipeline alerts. */
export function followUpState(row: PipelineRow, asOf: Date): FollowUpState {
  if (CLOSED_BID_STATUSES.has(row.status)) return 'CLOSED'
  if (!row.nextFollowUp) return 'SET ONE'
  const days = Math.round((row.nextFollowUp.getTime() - asOf.getTime()) / 86_400_000)
  if (days < 0) return 'OVERDUE'
  if (days === 0) return 'TODAY'
  if (days <= 7) return 'THIS WEEK'
  return 'SCHEDULED'
}

/**
 * Pipeline rollup: Bid Pipeline ▸ G4:V4 and Executive Dashboard ▸ C23:F27.
 * Weighted value uses the submitted amount once a bid has gone out, otherwise
 * the estimator's value, times the win probability.
 */
export function rollupPipeline(rows: readonly PipelineRow[], asOf: Date) {
  const open = rows.filter((r) => OPEN_BID_STATUSES.has(r.status))
  const won = rows.filter((r) => r.status === 'WON')
  const lost = rows.filter((r) => r.status === 'LOST')

  const valueOf = (r: PipelineRow) => (num(r.submittedAmount) > 0 ? num(r.submittedAmount) : num(r.estimatedValue))
  const weighted = (r: PipelineRow) => valueOf(r) * num(r.winProbability)

  const states = rows.map((r) => followUpState(r, asOf))

  const yearStart = new Date(Date.UTC(asOf.getUTCFullYear(), 0, 1))
  const wonYtd = won.filter((r) => r.decisionDate != null && r.decisionDate >= yearStart)

  return {
    activeBids: open.length,
    openPipelineValue: sumBy(open, valueOf),
    weightedPipeline: sumBy(open, weighted),
    bidsDueNext14Days: open.filter((r) => {
      if (!r.bidDue) return false
      const d = Math.round((r.bidDue.getTime() - asOf.getTime()) / 86_400_000)
      return d >= 0 && d <= 14
    }).length,
    followUpsOverdue: states.filter((s) => s === 'OVERDUE').length,
    followUpsDueThisWeek: states.filter((s) => s === 'TODAY' || s === 'THIS WEEK').length,
    withoutFollowUp: states.filter((s) => s === 'SET ONE').length,
    winRateByCount: safeDiv(won.length, won.length + lost.length),
    winRateByValue: safeDiv(sumBy(won, valueOf), sumBy(won, valueOf) + sumBy(lost, valueOf)),
    wonYtdValue: sumBy(wonYtd, valueOf),
    wonYtdCount: wonYtd.length,
    byStatus: groupPipelineByStatus(rows),
  }
}

function groupPipelineByStatus(rows: readonly PipelineRow[]) {
  const map = new Map<string, { status: string; count: number; value: number; weighted: number }>()
  for (const r of rows) {
    const entry = map.get(r.status) ?? { status: r.status, count: 0, value: 0, weighted: 0 }
    const value = num(r.submittedAmount) > 0 ? num(r.submittedAmount) : num(r.estimatedValue)
    entry.count += 1
    entry.value += value
    entry.weighted += value * num(r.winProbability)
    map.set(r.status, entry)
  }
  return [...map.values()].sort((a, b) => b.value - a.value)
}

export interface RevenueForecastRow {
  periodEnd: Date
  revenue: number
  cost: number
  grossProfit: number
  grossMargin: number
  overhead: number
  netOperatingProfit: number
  cumulativeRevenue: number
  cumulativeProfit: number
}

/**
 * Company revenue and profit forecast.
 *
 * Revenue in a month is the earned revenue implied by that month's cost spend:
 * cost × (contract ÷ forecast cost), summed across every project's S-curve.
 * Overhead is applied as a percentage of revenue so net operating profit falls
 * out of the same series.
 */
export function buildRevenueForecast(
  projectCurves: readonly {
    contractValue: number
    forecastCost: number
    rows: { periodEnd: Date; totalCost: number }[]
  }[],
  overheadPctOfRevenue: number,
): RevenueForecastRow[] {
  const byMonth = new Map<string, { periodEnd: Date; revenue: number; cost: number }>()

  for (const curve of projectCurves) {
    const revenueMultiplier = safeDiv(curve.contractValue, curve.forecastCost, 1)
    for (const row of curve.rows) {
      const k = `${row.periodEnd.getUTCFullYear()}-${String(row.periodEnd.getUTCMonth() + 1).padStart(2, '0')}`
      const entry = byMonth.get(k) ?? { periodEnd: row.periodEnd, revenue: 0, cost: 0 }
      entry.cost += num(row.totalCost)
      entry.revenue += num(row.totalCost) * revenueMultiplier
      byMonth.set(k, entry)
    }
  }

  let cumulativeRevenue = 0
  let cumulativeProfit = 0

  return [...byMonth.values()]
    .sort((a, b) => a.periodEnd.getTime() - b.periodEnd.getTime())
    .map((entry) => {
      const grossProfit = entry.revenue - entry.cost
      const overhead = entry.revenue * num(overheadPctOfRevenue)
      const netOperatingProfit = grossProfit - overhead
      cumulativeRevenue += entry.revenue
      cumulativeProfit += netOperatingProfit
      return {
        periodEnd: entry.periodEnd,
        revenue: entry.revenue,
        cost: entry.cost,
        grossProfit,
        grossMargin: safeDiv(grossProfit, entry.revenue),
        overhead,
        netOperatingProfit,
        cumulativeRevenue,
        cumulativeProfit,
      }
    })
}

export type GroupDimension = 'pm' | 'client' | 'projectType' | 'status' | 'location'

export interface DimensionRollup {
  key: string
  label: string
  projectCount: number
  contractValue: number
  costToDate: number
  forecastCost: number
  forecastProfit: number
  margin: number
  backlog: number
}

/** Powers the "forecast by project manager / client / market" views. */
export function rollupByDimension(rows: readonly ProjectRow[], dimension: GroupDimension): DimensionRollup[] {
  const keyOf = (r: ProjectRow): { key: string; label: string } => {
    switch (dimension) {
      case 'pm':
        return { key: r.pmUserId ?? 'unassigned', label: r.pmName ?? 'Unassigned' }
      case 'client':
        return { key: r.clientId ?? 'unknown', label: r.clientName ?? 'Unknown client' }
      case 'projectType':
        return { key: r.projectType ?? 'other', label: r.projectType ?? 'Other' }
      case 'location':
        return { key: r.location ?? 'other', label: r.location ?? 'Unspecified' }
      case 'status':
      default:
        return { key: r.status, label: r.status.replace(/_/g, ' ') }
    }
  }

  const map = new Map<string, DimensionRollup>()
  for (const r of rows) {
    const { key, label } = keyOf(r)
    const entry = map.get(key) ?? {
      key,
      label,
      projectCount: 0,
      contractValue: 0,
      costToDate: 0,
      forecastCost: 0,
      forecastProfit: 0,
      margin: 0,
      backlog: 0,
    }
    entry.projectCount += 1
    entry.contractValue += r.financials.contract.currentContract
    entry.costToDate += r.financials.totalCostToDate
    entry.forecastCost += r.financials.forecastCost
    entry.forecastProfit += r.financials.forecastProfit
    entry.backlog += r.financials.backlog
    map.set(key, entry)
  }

  return [...map.values()]
    .map((g) => ({ ...g, margin: safeDiv(g.forecastProfit, g.contractValue) }))
    .sort((a, b) => b.contractValue - a.contractValue)
}

export interface WipRow {
  projectId: string
  number: string
  name: string
  contractValue: number
  costToDate: number
  forecastCost: number
  pctComplete: number
  revenueEarned: number
  billedToDate: number
  overbilled: number
  underbilled: number
  forecastProfit: number
  forecastMargin: number
  profitEarned: number
}

/**
 * Work-in-progress schedule: the report a bonding agent and a bank both ask for.
 * Profit earned to date is forecast profit × percent complete.
 */
export function buildWipSchedule(rows: readonly ProjectRow[]): WipRow[] {
  return rows.map((r) => {
    const f = r.financials
    return {
      projectId: r.id,
      number: r.number,
      name: r.name,
      contractValue: f.contract.currentContract,
      costToDate: f.totalCostToDate,
      forecastCost: f.forecastCost,
      pctComplete: f.revenue.pctComplete,
      revenueEarned: f.revenue.revenueEarned,
      billedToDate: f.billing.totalCompletedAndStored,
      overbilled: f.revenue.overbilled,
      underbilled: f.revenue.underbilled,
      forecastProfit: f.forecastProfit,
      forecastMargin: f.forecastMargin,
      profitEarned: f.forecastProfit * f.revenue.pctComplete,
    }
  })
}
