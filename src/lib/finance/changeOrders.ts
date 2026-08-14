import { num, sumBy } from './core'
import {
  contractChangeDocuments,
  documentTotals,
  originalContractValue,
  type DocumentDerived,
} from './documents'
import type { ContractPosition } from './types'

/**
 * The contract position, built from documents that have actually been approved.
 *
 * This file used to decide what counted by looking at a status string. It no
 * longer does. A document reaches these figures only when it carries a
 * certified approval, which is `DocumentDerived.isOfficial`, and every function
 * here reads that and nothing else.
 *
 * The difference matters on a real job. A change order can be priced, sent,
 * signed by the owner and still be sitting on somebody's desk unverified. Under
 * the old rule, marking it approved in a dropdown moved a million dollars into
 * the contract value. Under this one, somebody has to certify it, and their
 * name and the moment are on the record.
 */

/** Kept as the name the rest of the system already uses for a priced document. */
export type ChangeOrderDerived = DocumentDerived

/**
 * Contract position: Setup ▸ C24:C28, with approval as the gate.
 *
 *   Current Contract   = Original + Approved changes
 *   Potential Contract = Current + Pending changes
 *
 * The original contract is the sum of approved contract documents where the
 * project has any, and the figure entered at setup where it does not.
 *
 * `pendingInclusionPct` controls how much pending exposure enters the forecast
 * contract: 0 excludes it entirely, which is the conservative default and what
 * the workbook did, 1 includes it in full, and anything between blends toward
 * the probability-weighted amount. It never touches the current contract.
 */
export function computeContractPosition(
  enteredOriginalContract: number,
  documents: readonly DocumentDerived[],
  pendingInclusionPct = 0,
): ContractPosition {
  const original = originalContractValue(documents, enteredOriginalContract)
  const changes = contractChangeDocuments(documents)

  const approved = sumBy(
    changes.filter((document) => document.isOfficial),
    (document) => document.ownerAmount,
  )
  const pending = sumBy(
    changes.filter((document) => document.isPending),
    (document) => document.ownerAmount,
  )
  const weightedPending = sumBy(
    changes.filter((document) => document.isPending),
    (document) => document.weightedOwnerAmount,
  )

  const current = original.amount + approved
  const inclusion = Math.max(0, Math.min(1, num(pendingInclusionPct)))

  return {
    originalContract: original.amount,
    approvedChangeOrders: approved,
    currentContract: current,
    pendingChangeOrders: pending,
    weightedPendingChangeOrders: weightedPending,
    potentialContract: current + pending,
    forecastContract: current + weightedPending * inclusion,
  }
}

/**
 * The four totals the change order tab shows, plus the margin behind them.
 *
 * Restated over the document totals so there is one definition of "approved"
 * in the system rather than two that could part company.
 */
export function changeOrderSummary(documents: readonly DocumentDerived[]) {
  const totals = documentTotals(documents)

  return {
    count: totals.enteredCount,
    approvedCount: totals.approvedCount,
    pendingCount: totals.pendingCount,
    rejectedCount: totals.rejectedCount,
    enteredValue: totals.entered,
    approvedRevenue: totals.approved,
    approvedCost: totals.approvedCost,
    approvedMargin: totals.approvedMargin,
    approvedMarginPct: totals.approvedMarginPct,
    pendingRevenue: totals.pending,
    pendingCost: totals.pendingCost,
    weightedPendingRevenue: totals.weightedPending,
    rejectedValue: totals.rejected,
    avgDaysPending: totals.avgDaysPending,
    scheduleImpactDays: totals.scheduleImpactDays,
  }
}

