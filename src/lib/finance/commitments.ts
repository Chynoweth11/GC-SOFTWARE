import { num, safeDiv, sumBy } from './core'
import type { CommitmentPosition } from './types'

export interface CommitmentChangeInput {
  amount: number
  status: string
}

export interface SubInvoiceInput {
  amount: number
  retentionPct: number
  approved: boolean
  amountPaid: number
  dateReceived: Date | null
  datePaid: Date | null
  lienWaiverReceived: boolean
}

export interface CommitmentInput {
  id: string
  number: string
  type: string
  vendorId: string
  vendorName: string
  originalAmount: number
  retentionPct: number
  pctComplete: number
  status: string
  forecastFinalOverride: number | null
  /** Budget carried for this scope, used to measure buyout savings. */
  budgetAmount: number
  changes: CommitmentChangeInput[]
  invoices: SubInvoiceInput[]
}

export interface CommitmentDerived extends CommitmentInput {
  approvedChanges: number
  pendingChanges: number
  currentValue: number
  earnedToDate: number
  invoicedToDate: number
  approvedToDate: number
  paidToDate: number
  retentionHeld: number
  netPayable: number
  outstanding: number
  remainingBalance: number
  forecastFinalCost: number
  buyoutVariance: number
  /** Positive when the commitment is forecast to exceed its own current value. */
  overrunRisk: number
}

const APPROVED_CHANGE = new Set(['APPROVED'])
const PENDING_CHANGE = new Set(['PENDING', 'SUBMITTED'])

/**
 * Derives one commitment's financial position.
 *
 * Workbook source: Subcontractors ▸ O–W and Sub Payments ▸ F–S.
 *   O  Current Contract    = Original + Approved COs
 *   Q  Earned to Date      = Current Contract × % Complete
 *   S  Retention Held      = Σ invoice retention withheld
 *   T  Invoiced to Date    = Σ invoice amounts
 *   U  Paid to Date        = Σ amounts paid
 *   V  Outstanding         = Σ (net payable − paid)
 *   W  Balance to Complete = Current Contract − Earned to Date
 *
 * Retention is summed from the invoices actually issued rather than computed
 * from the earned figure — the two diverge whenever a rate changed mid-job.
 */
export function deriveCommitment(input: CommitmentInput): CommitmentDerived {
  const approvedChanges = sumBy(
    input.changes.filter((c) => APPROVED_CHANGE.has(c.status)),
    (c) => c.amount,
  )
  const pendingChanges = sumBy(
    input.changes.filter((c) => PENDING_CHANGE.has(c.status)),
    (c) => c.amount,
  )
  const currentValue = num(input.originalAmount) + approvedChanges

  const invoicedToDate = sumBy(input.invoices, (i) => i.amount)
  const approvedToDate = sumBy(
    input.invoices.filter((i) => i.approved),
    (i) => i.amount,
  )
  const paidToDate = sumBy(input.invoices, (i) => i.amountPaid)
  const retentionHeld = sumBy(input.invoices, (i) => num(i.amount) * num(i.retentionPct))
  const netPayable = invoicedToDate - retentionHeld
  const outstanding = netPayable - paidToDate

  const earnedToDate = currentValue * num(input.pctComplete)
  const remainingBalance = currentValue - earnedToDate

  const forecastFinalCost =
    input.forecastFinalOverride != null ? num(input.forecastFinalOverride) : currentValue

  const budget = num(input.budgetAmount)
  const buyoutVariance = budget === 0 ? 0 : budget - num(input.originalAmount)

  return {
    ...input,
    approvedChanges,
    pendingChanges,
    currentValue,
    earnedToDate,
    invoicedToDate,
    approvedToDate,
    paidToDate,
    retentionHeld,
    netPayable,
    outstanding,
    remainingBalance,
    forecastFinalCost,
    buyoutVariance,
    overrunRisk: Math.max(0, forecastFinalCost - currentValue),
  }
}

export function rollupCommitments(rows: readonly CommitmentDerived[]): CommitmentPosition {
  return {
    originalValue: sumBy(rows, (r) => r.originalAmount),
    approvedChanges: sumBy(rows, (r) => r.approvedChanges),
    pendingChanges: sumBy(rows, (r) => r.pendingChanges),
    currentValue: sumBy(rows, (r) => r.currentValue),
    invoicedToDate: sumBy(rows, (r) => r.invoicedToDate),
    approvedToDate: sumBy(rows, (r) => r.approvedToDate),
    paidToDate: sumBy(rows, (r) => r.paidToDate),
    retentionHeld: sumBy(rows, (r) => r.retentionHeld),
    outstanding: sumBy(rows, (r) => r.outstanding),
    remainingBalance: sumBy(rows, (r) => r.remainingBalance),
    forecastFinalCost: sumBy(rows, (r) => r.forecastFinalCost),
    buyoutVariance: sumBy(rows, (r) => r.buyoutVariance),
  }
}

export type PaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'OVERDUE'

/**
 * Sub Payments ▸ S: PAID when nothing is outstanding, OVERDUE once an unpaid
 * balance has aged past `overdueDays` from receipt, otherwise PARTIAL/UNPAID.
 */
export function paymentStatus(
  invoice: SubInvoiceInput,
  dataDate: Date,
  overdueDays = 30,
): { status: PaymentStatus; daysOutstanding: number; netPayable: number; outstanding: number } {
  const netPayable = num(invoice.amount) - num(invoice.amount) * num(invoice.retentionPct)
  const outstanding = netPayable - num(invoice.amountPaid)
  const reference = invoice.datePaid ?? dataDate
  const daysOutstanding = invoice.dateReceived
    ? Math.round((reference.getTime() - invoice.dateReceived.getTime()) / 86_400_000)
    : 0

  let status: PaymentStatus
  if (outstanding <= 0.005) status = 'PAID'
  else if (daysOutstanding > overdueDays) status = 'OVERDUE'
  else if (num(invoice.amountPaid) > 0) status = 'PARTIAL'
  else status = 'UNPAID'

  return { status, daysOutstanding, netPayable, outstanding }
}

export interface BuyoutRow {
  packageId: string
  name: string
  tradeName: string | null
  budgetAmount: number
  awardAmount: number
  savings: number
  savingsPct: number
  status: string
  awardedVendorName: string | null
}

export function buyoutSummary(rows: readonly BuyoutRow[]) {
  const budget = sumBy(rows, (r) => r.budgetAmount)
  const awarded = sumBy(
    rows.filter((r) => r.awardAmount > 0),
    (r) => r.awardAmount,
  )
  const awardedBudget = sumBy(
    rows.filter((r) => r.awardAmount > 0),
    (r) => r.budgetAmount,
  )
  return {
    totalBudget: budget,
    totalAwarded: awarded,
    savings: awardedBudget - awarded,
    savingsPct: safeDiv(awardedBudget - awarded, awardedBudget),
    packagesBoughtOut: rows.filter((r) => r.awardAmount > 0).length,
    packagesOpen: rows.filter((r) => r.awardAmount <= 0).length,
  }
}
