import { num, safeDiv, sumBy } from './core'
import type { ContractPosition } from './types'

export interface ChangeOrderInput {
  id: string
  number: string
  status: string
  type: string
  ownerAmount: number
  costAmount: number
  probabilityPct: number
  dateInitiated: Date | null
  dateApproved: Date | null
  scheduleImpactDays: number
}

export const APPROVED_STATUSES = new Set(['APPROVED', 'EXECUTED'])
export const PENDING_STATUSES = new Set(['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'PRICING'])
export const DEAD_STATUSES = new Set(['REJECTED', 'VOID'])

export interface ChangeOrderDerived extends ChangeOrderInput {
  margin: number
  marginPct: number
  daysPending: number
  isApproved: boolean
  isPending: boolean
  weightedOwnerAmount: number
  weightedCostAmount: number
}

/**
 * Change Orders ▸ J,K,N.
 *   J  Margin      = Owner CO Amount − Cost Amount
 *   K  Margin %    = Margin ÷ Owner Amount
 *   N  Days Pending= approved ? (approved − initiated) : (data date − initiated)
 */
export function deriveChangeOrder(co: ChangeOrderInput, dataDate: Date): ChangeOrderDerived {
  const margin = num(co.ownerAmount) - num(co.costAmount)
  const isApproved = APPROVED_STATUSES.has(co.status)
  const isPending = PENDING_STATUSES.has(co.status)

  let daysPending = 0
  if (co.dateInitiated) {
    const end = isApproved ? co.dateApproved : dataDate
    if (end) daysPending = Math.round((end.getTime() - co.dateInitiated.getTime()) / 86_400_000)
  }

  return {
    ...co,
    margin,
    marginPct: safeDiv(margin, num(co.ownerAmount)),
    daysPending,
    isApproved,
    isPending,
    weightedOwnerAmount: num(co.ownerAmount) * num(co.probabilityPct),
    weightedCostAmount: num(co.costAmount) * num(co.probabilityPct),
  }
}

/**
 * Contract position — Setup ▸ C24:C28.
 *   Current Contract   = Original + Approved COs
 *   Potential Contract = Current + Pending COs
 *
 * `pendingInclusionPct` controls how much pending exposure enters the forecast
 * contract: 0 excludes it entirely (the conservative default the workbook used),
 * 1 includes it in full, and any value between blends toward the weighted amount.
 */
export function computeContractPosition(
  originalContract: number,
  changeOrders: readonly ChangeOrderDerived[],
  pendingInclusionPct = 0,
): ContractPosition {
  const approved = sumBy(
    changeOrders.filter((c) => c.isApproved),
    (c) => c.ownerAmount,
  )
  const pending = sumBy(
    changeOrders.filter((c) => c.isPending),
    (c) => c.ownerAmount,
  )
  const weightedPending = sumBy(
    changeOrders.filter((c) => c.isPending),
    (c) => c.weightedOwnerAmount,
  )

  const current = num(originalContract) + approved
  const inclusion = Math.max(0, Math.min(1, num(pendingInclusionPct)))

  return {
    originalContract: num(originalContract),
    approvedChangeOrders: approved,
    currentContract: current,
    pendingChangeOrders: pending,
    weightedPendingChangeOrders: weightedPending,
    potentialContract: current + pending,
    forecastContract: current + weightedPending * inclusion,
  }
}

/** Cost impact of approved change orders, which is what posts to the budget. */
export function approvedCostImpact(changeOrders: readonly ChangeOrderDerived[]): number {
  return sumBy(
    changeOrders.filter((c) => c.isApproved),
    (c) => c.costAmount,
  )
}

export function changeOrderSummary(changeOrders: readonly ChangeOrderDerived[]) {
  const approved = changeOrders.filter((c) => c.isApproved)
  const pending = changeOrders.filter((c) => c.isPending)
  const rejected = changeOrders.filter((c) => DEAD_STATUSES.has(c.status))
  const approvedRevenue = sumBy(approved, (c) => c.ownerAmount)
  const approvedCost = sumBy(approved, (c) => c.costAmount)

  return {
    count: changeOrders.length,
    approvedCount: approved.length,
    pendingCount: pending.length,
    rejectedCount: rejected.length,
    approvedRevenue,
    approvedCost,
    approvedMargin: approvedRevenue - approvedCost,
    approvedMarginPct: safeDiv(approvedRevenue - approvedCost, approvedRevenue),
    pendingRevenue: sumBy(pending, (c) => c.ownerAmount),
    pendingCost: sumBy(pending, (c) => c.costAmount),
    weightedPendingRevenue: sumBy(pending, (c) => c.weightedOwnerAmount),
    rejectedValue: sumBy(rejected, (c) => c.ownerAmount),
    avgDaysPending: pending.length
      ? sumBy(pending, (c) => c.daysPending) / pending.length
      : 0,
    scheduleImpactDays: sumBy(approved, (c) => c.scheduleImpactDays),
  }
}
